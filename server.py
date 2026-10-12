"""
PNF and pNFS-Lattice Study App Server
A zero-dependency Python 3 HTTP server with REST APIs for the interactive
pNFS & pNFS-Lattice learning environment.
"""

import sys
import os
import json
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse

# Define port and directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Core educational dataset: modules, quiz questions, flashcards, and simulated cluster state
LEARNING_DATA = {
    "topics": [
        {
            "id": "intro-pnfs",
            "title": "1. What is pNFS (Parallel NFS)?",
            "subtitle": "NFSv4.1 (RFC 5661) & NFSv4.2 (RFC 7862)",
            "summary": "In classical NFS (v3/v4.0), a single storage server handles both metadata (directory traversals, file permissions, ownership) and actual file data payloads. This forms an immediate I/O bottleneck.",
            "content": """
### The Fundamental Shift
Parallel NFS (**pNFS**) splits the storage responsibilities into two distinct, decoupled planes:
1. **Metadata Server (MDS)**: Coordinates control paths, namespaces, file opens/creates, authorization, and issues **layouts**.
2. **Data Servers (DS)**: High-throughput storage nodes that store the actual data payload stripes. Clients bypass the MDS and stream data directly to/from DS nodes in parallel over TCP or InfiniBand/RoCE RDMA.

### Protocol Mechanics
- **LAYOUTGET**: The client requests the stripe placement mapping for a byte range of a file from the MDS.
- **Direct I/O**: The client performs reads and writes directly with the data servers.
- **LAYOUTCOMMIT**: The client notifies the MDS of modified file size, modification times, and written ranges.
- **LAYOUTRETURN / CB_LAYOUTRECALL**: State reclamation when layouts are released or recalled by the MDS.
            """,
            "key_takeaways": [
                "Splits storage traffic into Metadata (MDS) and Data (DS) streams.",
                "Clients read/write directly across DS cluster nodes in parallel.",
                "Dramatically increases aggregate data bandwidth for large files."
            ]
        },
        {
            "id": "flex-files",
            "title": "2. Flex Files Layout (RFC 8435)",
            "subtitle": "The Modern Foundation for Flexible Data Striping",
            "summary": "While early pNFS layouts (Files, Blocks, Objects) were rigid and often required specialized block storage or proprietary SAN fabric, Flex Files standardized flexible file-based striping over standard NFS.",
            "content": """
### Why Flex Files?
Flex Files (RFC 8435) solved the deployment hurdles of earlier pNFS standards:
- **Commodity Backends**: Data servers (DS) can run regular, unpatched Linux kernel NFS servers (`knfsd`) speaking NFSv3 or NFSv4.1.
- **Mirroring & Multipathing**: Layouts can specify multiple mirrors per stripe with priority, enabling fault tolerance and read load balancing.
- **Tight I/O Error Reporting**: Clients report I/O errors and DS connection failures directly back to the MDS via `LAYOUTERROR` and `LAYOUTSTATS`.
- **Credential Routing**: The MDS can deliver synthetic client credentials to allow the client to authenticate with the target DS.
            """,
            "key_takeaways": [
                "Turns ordinary Linux knfsd servers into high-performance pNFS Data Servers.",
                "Supports active replication, multiple mirror tiers, and dynamic failover.",
                "Enables granular error reporting (LAYOUTERROR) and performance feedback."
            ]
        },
        {
            "id": "the-bottleneck",
            "title": "3. The Traditional pNFS Metadata Bottleneck",
            "subtitle": "Why Traditional pNFS Collapses Under AI & HPC Workloads",
            "summary": "While pNFS solved the data bandwidth challenge, it left the Metadata Server (MDS) as a centralized, single point of serialization.",
            "content": """
### The AI / HPC Metadata Crisis
Modern deep learning training runs (e.g., thousands of GPUs running PyTorch `DataLoader` across millions of small image/token files) and distributed checkpointing (saving 100B+ parameter model weights simultaneously) generate massive metadata storms:
- **Directory Lock Contention**: When thousands of compute nodes open or create files in the same directory, traditional POSIX locking on a single MDS serializes every request.
- **Active-Passive Limits**: High-Availability (HA) pairs only provide failover, not true scale-out metadata throughput.
- **CPU & Memory Bottlenecks**: A single server runs out of RPC worker threads, memory cache, and network socket descriptors.
- **POSIX Traversal Latency**: Standard `find` or directory walks require millions of recursive RPC roundtrips across the network.
            """,
            "key_takeaways": [
                "Data bandwidth scales with DS nodes, but metadata throughput is throttled by a single MDS.",
                "AI training dataloaders and checkpointing trigger severe metadata lock serialization.",
                "Traditional HA pairs do not solve concurrency scaling."
            ]
        },
        {
            "id": "pnfs-lattice",
            "title": "4. Enter pNFS-Lattice: Elastic Scale-Out Metadata",
            "subtitle": "PEAK:AIO, LANL, CMU, and Linux Foundation",
            "summary": "pNFS-Lattice is a breakthrough open-source user-space metadata server architecture that turns the MDS into an active-active, horizontally scalable daemon fleet backed by a distributed in-memory catalogue.",
            "content": """
### The Core Innovation
Initiated by **PEAK:AIO** in collaboration with **Los Alamos National Laboratory (LANL)** and **Carnegie Mellon University (CMU)**, Lattice decouples:
1. **Metadata Authority** (the source of truth)
2. **Protocol Coordination** (client sessions, sequencing, replay caches)
3. **Data Service Placement** (dynamic DS striping)

### Four-Layer Architecture:
1. **Protocol State Plane**: Handles client sessions, replay caches, leases, state management, and failover across daemons.
2. **Lattice Core (User-Space MDS Fleet)**: Lightweight, stateless `lattice-pnfs` daemons running in user space. Any number of MDS nodes (from 1 to 1,000+) can run concurrently without a centralized master or leader election.
3. **MD Catalog Authority (RonDB)**: The single transactional source of truth for inodes, dirents, stripe mappings, and attributes using **RonDB** (distributed MySQL NDB cluster). All metadata mutations are single atomic NDB transactions with row-level locking.
4. **Data Server Control Plane**: Orchestrates unmodified commodity Linux `knfsd` storage servers, monitors health, probes I/O limits, and coordinates stripe placement.
            """,
            "key_takeaways": [
                "Active-Active MDS: Any number of Lattice daemons serve the exact same namespace simultaneously.",
                "No single coordinator or leader election needed—RonDB handles distributed atomicity.",
                "Unmodified clients (standard Linux NFSv4.2) and unmodified storage servers (standard Linux knfsd)."
            ]
        },
        {
            "id": "rondb-catalogue",
            "title": "5. The RonDB Catalogue Engine & Atomicity",
            "subtitle": "Row-Level Locking and Interpreted Updates",
            "summary": "How Lattice solves concurrent metadata mutations across dozens of active MDS daemons without distributed deadlocks or race conditions.",
            "content": """
### Zero Race Conditions with Interpreted Updates
In traditional clustered filesystems, modifying a directory requires complex distributed lock managers (DLM). Lattice utilizes RonDB's `interpretedUpdateTuple` (`incValue` / `subValue`):
- When `mkdir`, `rmdir`, `link`, or `rename` occurs, the parent directory's `nlink`, `mtime`, `ctime`, and `change` attributes are updated atomically inside the storage engine tuple.
- No read-modify-write race is possible even if 50 different MDS daemons update the same parent directory simultaneously.

### Single Transaction Guarantee
- `setattr`: Acquires an exclusive row lock, reads the current inode, merges the attribute mask, and writes back in a single NDB transaction.
- `rename`: Atomically deletes source dirent, writes destination dirent, updates both parent counters, and updates child parent_fileid in a single commit.
- `memdb` vs `RonDB`: For testing, Lattice includes an in-memory hash backend (`catalogue_memdb.c`); in production, `catalogue_rondb_shim.cpp` wraps the NDB C++ API.
            """,
            "key_takeaways": [
                "NDB interpretedUpdateTuple eliminates read-modify-write races on shared directory counters.",
                "Every mutating POSIX operation commits as exactly one ACID NDB transaction.",
                "Row-level locking allows high-concurrency operations within the same directory."
            ]
        },
        {
            "id": "advanced-features",
            "title": "6. Advanced Lattice Capabilities: Memory, Search & HPC",
            "subtitle": "Wave-2 Heap Scratch, Parallel Find-API & HPC-Shared Wide Striping",
            "summary": "Deep engineering optimizations that deliver extreme performance for AI pipelines and supercomputers.",
            "content": """
### 1. Wave-2 Heap Scratch Memory Model
- **Problem**: Early implementations inlined huge request/result buffers (524 KB per slot, ~37 MB per worker thread), causing excessive memory overhead and cache misses.
- **Wave-2 Solution**: Workers use calloc'd slot arrays (~13 KB result slot, ~4 KB op slot). Scratch blocks live outside the union with grow-once buffers. Static assertions prevent payloads from growing without notice.

### 2. Parallel Metadata Search (Find API)
- NFSv4 has no query verb. A query like "find files > 1GB created in the last 24h" normally requires walking millions of files via RPC.
- Lattice's `mds-find` and `mds-apid` (HTTP/JSON query service) push attribute predicates directly into `NdbScanFilter` across all RonDB fragments in parallel.
- Evaluates queries at the storage engine level without taking locks or blocking client NFS traffic!

### 3. HPC-Shared File Mode (N-to-1 Striping)
- Sets the `MDS_IFLAG_HPC_SHARED` bit on an inode.
- Tailored for checkpointing where thousands of compute nodes write disjoint byte offsets into the same model checkpoint file simultaneously.
- Emits wide-stripe geometry, favors RDMA/GPUDirect storage endpoints, and avoids serialization.
            """,
            "key_takeaways": [
                "Wave-2 scratch reduces worker memory footprint by ~75% and prevents buffer leaks.",
                "Find-API pushes queries directly to database fragments, eliminating recursive NFS directory walks.",
                "HPC-Shared mode optimizes massive parallel writes into single large checkpoint files."
            ]
        }
    ],
    "flashcards": [
        {
            "id": 1,
            "category": "Architecture",
            "front": "What are the two decoupled roles in pNFS?",
            "back": "The Metadata Server (MDS), which handles namespace/permissions/layouts, and Data Servers (DS), which store file stripes and handle direct client I/O."
        },
        {
            "id": 2,
            "category": "Protocols",
            "front": "What RFC defines pNFS Flex Files layout?",
            "back": "RFC 8435. It allows commodity Linux knfsd instances to serve as Data Servers over NFSv3 or NFSv4.1 with multi-mirror support."
        },
        {
            "id": 3,
            "category": "Lattice Core",
            "front": "What is the single source of truth for metadata in pNFS-Lattice?",
            "back": "RonDB (MySQL NDB Cluster). All MDS daemons are stateless workers sharing this distributed, in-memory, row-locked transactional store."
        },
        {
            "id": 4,
            "category": "Concurrency",
            "front": "How does Lattice prevent read-modify-write races when multiple MDS daemons update the same parent directory?",
            "back": "By using RonDB's interpretedUpdateTuple (incValue/subValue), which atomically updates nlink, mtime, ctime, and change counters directly inside the database engine."
        },
        {
            "id": 5,
            "category": "Client Discovery",
            "front": "How do standard NFS clients find the correct MDS in a Lattice deployment without custom drivers?",
            "back": "Via standard NFSv4.1/4.2 fs_locations referrals (NFS4ERR_MOVED). Clients dynamically redirect to available MDS nodes."
        },
        {
            "id": 6,
            "category": "Search",
            "front": "How does Lattice find-API (mds-find / mds-apid) achieve sub-second scans of millions of files?",
            "back": "It pushes attribute filter predicates down into RonDB's NdbScanFilter across all storage fragments concurrently (LM_CommittedRead), bypassing recursive NFS RPC walks."
        },
        {
            "id": 7,
            "category": "HPC",
            "front": "What does the MDS_IFLAG_HPC_SHARED flag optimize?",
            "back": "N-to-1 parallel writes where thousands of GPU/compute nodes stream byte ranges into a single shared checkpoint file, assigning wide-stripe geometry and RDMA DS endpoints."
        },
        {
            "id": 8,
            "category": "Memory",
            "front": "What is the Wave-2 Heap Scratch memory model in Lattice?",
            "back": "A refactored per-worker memory layout that moves large payload scratch outside the op/result union, shrinking result slots from 524 KB to ~13 KB and eliminating buffer leakage risks."
        },
        {
            "id": 9,
            "category": "Storage Backend",
            "front": "What software runs on Data Servers (DS) in a pNFS-Lattice cluster?",
            "back": "Standard, unpatched Linux kernel NFS servers (knfsd) communicating over TCP or InfiniBand/RoCE RDMA."
        },
        {
            "id": 10,
            "category": "Industry",
            "front": "Who developed pNFS-Lattice and what major acquisition occurred in September 2026?",
            "back": "PEAK:AIO in technical partnership with LANL and CMU. In September 2026, NetApp announced plans to acquire PEAK:AIO to integrate Lattice into its ONTAP architecture."
        }
    ],
    "quiz": [
        {
            "id": "q1",
            "question": "What is the primary architectural bottleneck that pNFS-Lattice solves?",
            "options": [
                "Data server network throughput saturation during sequential reads",
                "Centralized, static Metadata Server (MDS) serialization during high-concurrency metadata ops",
                "Client-side kernel NVMe-oF driver incompatibilities",
                "TCP window sizing on Linux knfsd data servers"
            ],
            "correct": 1,
            "explanation": "While pNFS allows data bandwidth to scale with DS nodes, traditional pNFS keeps a single static MDS (or active-passive pair), bottlenecking AI/HPC workloads that perform millions of file opens and lookups."
        },
        {
            "id": "q2",
            "question": "Which database engine serves as the shared metadata authority in pNFS-Lattice?",
            "options": [
                "PostgreSQL with Citus extension",
                "Apache Cassandra with Raft consensus",
                "RonDB (MySQL NDB Cluster)",
                "RocksDB embedded on each local MDS NVMe drive"
            ],
            "correct": 2,
            "explanation": "Lattice uses RonDB, a high-throughput, in-memory, distributed MySQL NDB Cluster technology that provides sub-millisecond atomic transactions and row-level locking."
        },
        {
            "id": "q3",
            "question": "How do clients connect to different MDS nodes in a Lattice active-active cluster without proprietary client software?",
            "options": [
                "Using standard NFSv4 fs_locations referrals (NFS4ERR_MOVED)",
                "By loading a custom Linux kernel eBPF filter",
                "Via DNS Round-Robin with proprietary TCP hijacking",
                "Clients must run a specialized userspace FUSE driver"
            ],
            "correct": 0,
            "explanation": "Lattice strictly adheres to standard NFS specifications. Clients use standard NFSv4 referrals (fs_locations / NFS4ERR_MOVED) supported natively in the standard Linux kernel."
        },
        {
            "id": "q4",
            "question": "Under RFC 8435 (Flex Files), what software runs on the Data Servers (DS)?",
            "options": [
                "Proprietary PEAK:AIO microkernel daemons",
                "Unmodified Linux kernel NFS server (knfsd) over TCP or RDMA",
                "Specialized S3 object gateway emulation",
                "Custom Ceph OSD storage engines"
            ],
            "correct": 1,
            "explanation": "Flex Files layout allows standard Linux knfsd instances to serve as data servers, avoiding proprietary storage software or kernel patches."
        },
        {
            "id": "q5",
            "question": "What atomic database technique avoids read-modify-write races when updating parent directories across multiple MDS daemons?",
            "options": [
                "Global distributed 2-phase commit table locks",
                "NDB interpretedUpdateTuple with atomic incValue/subValue operations",
                "Optimistic timestamp concurrency with client retry loops",
                "Leader election with Raft quorum write leases"
            ],
            "correct": 1,
            "explanation": "RonDB's interpretedUpdateTuple executes counter modifications (nlink, mtime, ctime, change) directly inside the database engine, ensuring strict atomicity without distributed lock managers."
        },
        {
            "id": "q6",
            "question": "How does the Lattice Find-API execute fast metadata queries compared to standard POSIX find?",
            "options": [
                "It maintains an external Elasticsearch cluster",
                "It pushes predicates into RonDB's NdbScanFilter for parallel fragment execution without table locks",
                "It performs multithreaded recursive NFS LOOKUP RPCs",
                "It indexes file names into an external Redis cache"
            ],
            "correct": 1,
            "explanation": "Lattice pushes search predicates down to the storage data nodes using NdbScanFilter (LM_CommittedRead), evaluating conditions across all database fragments in parallel."
        },
        {
            "id": "q7",
            "question": "What is the primary benefit of the Wave-2 Heap Scratch memory model in the Lattice MDS?",
            "options": [
                "It disables memory allocation completely by using raw disk swapping",
                "It eliminates buffer leaks and shrinks worker result slot footprint from 524 KB to ~13 KB",
                "It stores entire 100GB files inside MDS RAM",
                "It forces all RPC worker threads to use a single shared global mutex"
            ],
            "correct": 1,
            "explanation": "Wave-2 moves large payloads outside the union and allocates them lazily in scratch blocks, preventing buffer leakage, reducing per-worker memory by ~75%, and drastically improving L1/L2 cache hit rates."
        },
        {
            "id": "q8",
            "question": "When setting MDS_IFLAG_HPC_SHARED on an inode, what behavior does the MDS adopt?",
            "options": [
                "It deletes the file immediately to save disk space",
                "It assigns wide stripe geometry across many DSes and favors RDMA/GPUDirect endpoints for N-to-1 parallel writes",
                "It disables writes and turns the file read-only",
                "It routes all data bytes through a single MDS socket"
            ],
            "correct": 1,
            "explanation": "HPC-Shared mode is designed for supercomputing/AI checkpointing where thousands of processes write to different byte ranges of the same file simultaneously, providing wide striping and high-speed RDMA paths."
        }
    ]
}


class StudyAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/data":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(LEARNING_DATA).encode("utf-8"))
            return

        if path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            status = {
                "status": "online",
                "version": "1.0.0",
                "system": "pNFS-Lattice Study Companion",
                "technology": "pNFS (RFC 5661, 7862) / Flex Files (RFC 8435) / RonDB active-active",
                "modules_count": len(LEARNING_DATA["topics"]),
                "flashcards_count": len(LEARNING_DATA["flashcards"]),
                "quiz_count": len(LEARNING_DATA["quiz"])
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
            return

        # Default static file handling
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/simulate":
            # Simulator endpoint to calculate throughput and bottleneck models
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                params = json.loads(body)
            except Exception:
                params = {}

            clients = int(params.get("clients", 100))
            mds_nodes = int(params.get("mds_nodes", 4))
            ds_nodes = int(params.get("ds_nodes", 8))
            mode = params.get("mode", "lattice")  # "trad_nfs", "trad_pnfs", "lattice"

            # Simulation physics calculation
            # Traditional NFS: Single MDS handles both data and metadata (caps out at ~25,000 IOPS / 4GB/s)
            # Traditional pNFS: MDS is 1 node (caps out at ~60,000 metadata IOPS), data scales with DS
            # pNFS-Lattice: Active-active MDS scales linearly with mds_nodes backed by RonDB (up to 1M+ metadata IOPS), data scales with DS

            if mode == "trad_nfs":
                effective_mds = 1
                max_md_iops = 35000
                max_data_bw_gb = 5.0
                latency_ms = max(0.5, (clients / 100) * 1.8)
                md_bottleneck = clients > 150
            elif mode == "trad_pnfs":
                effective_mds = 1
                max_md_iops = 65000
                max_data_bw_gb = ds_nodes * 6.5
                latency_ms = max(0.3, (clients / 250) * 1.2)
                md_bottleneck = clients > 300
            else:  # "lattice"
                effective_mds = mds_nodes
                # Scales with MDS fleet + RonDB
                max_md_iops = mds_nodes * 95000
                max_data_bw_gb = ds_nodes * 12.0  # Flex Files RDMA
                latency_ms = max(0.08, 0.08 + (clients / (mds_nodes * 1500)) * 0.15)
                md_bottleneck = False

            sim_result = {
                "mode": mode,
                "clients": clients,
                "effective_mds": effective_mds,
                "ds_nodes": ds_nodes,
                "metadata_iops": min(clients * 800, max_md_iops),
                "data_bandwidth_gbps": min(clients * 0.25, max_data_bw_gb),
                "avg_latency_ms": round(latency_ms, 3),
                "is_bottlenecked": md_bottleneck,
                "bottleneck_source": "Single static MDS saturated" if md_bottleneck else "None (Linear Scale)"
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(sim_result).encode("utf-8"))
            return

        self.send_error(404, "Endpoint not found")


def run(port=8080):
    server_address = ("0.0.0.0", port)
    httpd = HTTPServer(server_address, StudyAppHandler)
    print("=" * 65)
    print(f"  pNFS & pNFS-Lattice Study Environment")
    print(f"  Serving on: http://localhost:{port}")
    print(f"  Press Ctrl+C to stop.")
    print("=" * 65)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the pNFS-Lattice Study App server")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default: 8080)")
    parser.add_argument("--dev", action="store_true", help="Enable verbose dev mode")
    args = parser.parse_args()
    run(args.port)
