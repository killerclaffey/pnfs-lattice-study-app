# pNFS and pNFS-Lattice: The Definitive Technical Architecture Guide

---

## 1. Executive Summary & Context

As deep learning models scaled to hundreds of billions of parameters and high-performance computing (HPC) clusters grew to tens of thousands of GPUs, traditional storage architectures collided with the **"Metadata Wall."**

While Parallel NFS (**pNFS**) successfully decoupled data bandwidth from the metadata control plane in 2010 (allowing clients to stream data directly to storage servers), it left the **Metadata Server (MDS)** as a centralized, single-point-of-bottleneck. In workloads characterized by millions of small files (such as PyTorch `DataLoader` dataset ingestion) or synchronized writes (such as multi-terabyte model checkpoint dumps), the centralized MDS collapsed under directory lock contention and RPC queuing.

In 2026, **pNFS-Lattice** emerged as an open-source, scale-out metadata and coordination architecture for **NFSv4.2** and **pNFS Flex Files (RFC 8435)**. Initiated by **PEAK:AIO** in technical collaboration with **Los Alamos National Laboratory (LANL)** and **Carnegie Mellon University (CMU)**, supported by the **Linux Foundation** (and targeted for acquisition by **NetApp** in late 2026), Lattice transforms the metadata tier into an active-active, horizontally scalable daemon fleet backed by an in-memory transactional database (**RonDB**).

---

## 2. Fundamentals of pNFS (Parallel NFS)

### 2.1 The Traditional NFS Problem
In classical NFS (NFSv3 / NFSv4.0):
- A single storage controller serves all metadata operations (`LOOKUP`, `GETATTR`, `ACCESS`, `OPEN`, `CREATE`) **and** all payload I/O (`READ`, `WRITE`).
- Storage bandwidth is constrained by the network and bus bandwidth of that single controller.
- As clusters scale from 10 to 1,000+ compute nodes, head-node saturation is inevitable.

```
Classical NFS:
Compute Clients (x1000) ───[All Metadata & All Data Bytes]───▶ Single NFS Server
```

### 2.2 The pNFS Paradigm Shift (RFC 5661 / RFC 7862)
Introduced in NFSv4.1 (RFC 5661) and extended in NFSv4.2 (RFC 7862), pNFS splits the file system into two distinct entities:

1. **Metadata Server (MDS)**:
   - Manages directory structures, file permissions, ownership, locks, and namespace hierarchy.
   - Does **not** handle file data payload during steady-state reading and writing.
   - Issues **Layouts** to clients describing which Data Servers hold file stripes.
2. **Data Servers (DS)**:
   - High-throughput storage nodes holding file data stripes.
   - Clients perform direct parallel reads and writes to DS nodes over TCP or InfiniBand/RoCE RDMA.

```
pNFS Architecture:
                             ┌─────────────────┐
                             │  Metadata Server│
                             │      (MDS)      │
                             └────────┬────────┘
                    1. LAYOUTGET      │  4. LAYOUTCOMMIT
                        ┌─────────────┴─────────────┐
                        ▼                           ▼
                 ┌──────────────┐            ┌──────────────┐
                 │ Client 1     │            │ Client 2     │
                 └──────┬───────┘            └──────┬───────┘
                        │ 2. Direct parallel I/O    │
          ┌─────────────┼───────────────┬───────────┴──────────┐
          ▼             ▼               ▼                      ▼
    ┌───────────┐ ┌───────────┐   ┌───────────┐          ┌───────────┐
    │Data Server│ │Data Server│   │Data Server│   ...    │Data Server│
    │   DS-01   │ │   DS-02   │   │   DS-03   │          │   DS-N    │
    └───────────┘ └───────────┘   └───────────┘          └───────────┘
```

### 2.3 pNFS Protocol Operations
- **`LAYOUTGET`**: The client requests a byte-range layout for a file, specifying layout type (e.g., Flex Files) and I/O mode (`READ` or `READWRITE`).
- **`LAYOUTCOMMIT`**: When writing, the client informs the MDS of changes to file size, modification times, and written byte ranges.
- **`LAYOUTRETURN`**: The client voluntarily surrenders its layout (e.g., upon `CLOSE` or memory reclamation).
- **`CB_LAYOUTRECALL`**: An asynchronous callback from the MDS to the client demanding immediate return of layout grants (e.g., when another client requests conflicting access or storage rebalancing occurs).

---

## 3. pNFS Flex Files Layout (RFC 8435)

While earlier pNFS layout types (Files RFC 5664, Blocks RFC 5663, Objects RFC 5662) suffered from deployment complexity or required specialized SAN hardware, **Flex Files** (RFC 8435) became the modern standard:

| Feature | Legacy Layouts (Files / Blocks) | Flex Files (RFC 8435) |
|---|---|---|
| **Data Server Software** | Specialized storage firmware | Standard unpatched Linux `knfsd` (NFSv3 or NFSv4.1) |
| **Mirroring & Multipath** | Usually external hardware RAID | Built into protocol layout (multiple DS mirrors per stripe) |
| **Failover Handling** | Client hang or MDS failover stall | Granular client-side failover to alternative mirror |
| **Error Feedback** | Minimal status codes | Detailed `LAYOUTERROR` & `LAYOUTSTATS` returned to MDS |
| **Security & Auth** | Complex Kerberos delegation | Synthetic synthetic user credentials routed via MDS |

---

## 4. The Traditional pNFS Bottleneck

Despite decoupling data from metadata, traditional pNFS systems suffered from a fundamental flaw: **The MDS remained a centralized bottleneck.**

```
Traditional pNFS:
Data Tier:     DS-01, DS-02, ..., DS-32  ➔ Scalable (Linear Bandwidth)
Metadata Tier: MDS (Single Active Node)   ➔ Monolithic Bottleneck (Capped IOPS)
```

### What Happens in High-Concurrency AI/HPC Workloads:
1. **PyTorch DataLoader Storms**: When 4,096 distributed workers initialize training, they simultaneously issue millions of `LOOKUP`, `OPEN`, and `GETATTR` requests against the same shared dataset directory.
2. **Directory Lock Serialization**: A single MDS must take POSIX directory read/write locks to update timestamps or verify directory entries. All 4,096 workers serialize on a single CPU thread.
3. **Active-Passive Standby Illusion**: Traditional High-Availability (HA) clusters (Pacemaker/Corosync) only provide failover, not load distribution. Standby nodes sit idle.
4. **POSIX Traversal Overhead**: A simple `find /data -size +1G` requires traversing millions of inodes over sequential NFS RPCs, freezing other cluster operations.

---

## 5. pNFS-Lattice: Architectural Deep Dive

**pNFS-Lattice** eliminates the static MDS by introducing an active-active, user-space metadata server fleet with a decoupled, distributed in-memory catalogue authority.

```
                         ┌────────────────────────────────────────────────────────┐
                         │              Lattice MDS Cluster (Active-Active)       │
                         │                                                        │
                         │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
                         │  │  MDS Node 1  │  │  MDS Node 2  │  │  MDS Node N  │  │
                         │  │ lattice-pnfs │  │ lattice-pnfs │  │ lattice-pnfs │  │
                         │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
                         │         └─────────────────┼─────────────────┘          │
                         └───────────────────────────┼────────────────────────────┘
                                                     │ NDB C++ API (catalogue_rondb_shim)
                                      ┌──────────────┴──────────────┐
                                      │        RonDB Cluster        │
                                      │   (Single Source of Truth)  │
                                      │                             │
                                      │  • inodes       • dirents   │
                                      │  • stripe_maps  • gc_queue  │
                                      │  • xattrs       • config_kv │
                                      └──────────────┬──────────────┘
                                                     │
                                  ┌──────────────────┴──────────────────┐
                           ┌──────▼──────┐                       ┌──────▼──────┐
                           │   NFS DS-1  │                       │   NFS DS-N  │
                           │(Linux knfsd)│                       │(Linux knfsd)│
                           └─────────────┘                       └─────────────┘
```

### 5.1 The Four Architectural Planes

1. **Protocol State Plane**:
   - Manages client session states, lease times, sequence replay caches, and connection stateids.
   - Uses standard NFSv4 referrals (`fs_locations` / `NFS4ERR_MOVED`) to route clients to any active MDS without proprietary client drivers.

2. **Lattice Core (User-Space MDS Fleet)**:
   - Implemented in C (`src/mds/main.c`, `compound.c`, `rpc_server.c`).
   - Every MDS daemon is stateless regarding authoritative data.
   - Any number of daemons (from 1 to 1,000+) can run concurrently without a master election or Paxos quorum.

3. **MD Catalog Authority (RonDB Cluster)**:
   - Uses **RonDB** (high-throughput, distributed MySQL NDB cluster technology).
   - Serves as the single transactional source of truth.
   - All mutations commit as **single ACID NDB transactions with row-level locking**.

4. **Data Server Control Plane**:
   - Manages commodity, unpatched Linux kernel NFS servers (`knfsd`).
   - Probes storage limits (`rtmax`/`wtmax`) on cadences via `NFSv3 FSINFO`.
   - Cleans up orphan stripes asynchronously via the `gc_queue`.

---

## 6. Key Engineering Innovations in Lattice

### 6.1 RonDB Atomic Interpreted Updates (`interpretedUpdateTuple`)
In traditional clustered filesystems, modifying a directory requires complex distributed lock managers (DLM) that cause catastrophic stalls under write storms.

Lattice solves this using RonDB's `interpretedUpdateTuple`:
- When `mkdir`, `rmdir`, `link`, or `rename` is executed, the parent directory's counters (`nlink`, `mtime`, `ctime`, `change`) are incremented or decremented **inside the database engine tuple** via atomic `incValue` / `subValue` primitives.
- **Zero read-modify-write race**: Fifty independent MDS daemons can create files in the exact same directory concurrently without distributed deadlocks.

### 6.2 Wave-2 Heap Scratch Memory Model
- **Legacy Issue**: Early prototypes inlined maximum possible NFS payload buffers inside the op/result union structures, consuming ~524 KB per result slot (~37 MB per worker thread) and stressing CPU L1/L2 caches.
- **Wave-2 Architecture**: Scratch blocks were moved outside the union. Buffers are allocated lazily up to the payload maximum, shrinking result slots to **~13 KB** (a ~75% memory footprint reduction). Compile-time `_Static_assert` guards ensure unions never silently expand.

### 6.3 Fused Operations & Fastpath Layout Grants
- **Fused OPEN(CREATE) + LAYOUTGET**: The MDS pre-allocates layout coordinates during file creation, returning the Flex Files layout in the initial OPEN reply to cut roundtrip latency in half.
- **Newfile Fastpath**: When a file is created and opened in the same compound, Lattice skips the conflict-recall scan because brand-new fileids cannot have outstanding layout holders.

### 6.4 Parallel Metadata Search (Find API)
NFSv4 has no native search verb; finding files matching criteria typically requires recursive directory RPC walks.

Lattice introduces the **Find API** (`mds-find` and `mds-apid`):
- Pushes SQL/attribute predicates (size, mtime, uid) down to RonDB data nodes via `NdbScanFilter` (`LM_CommittedRead`).
- Evaluates queries directly across all database fragments in parallel without taking row locks or interfering with active client NFS I/O.
- Sub-second search times across hundreds of millions of files.

### 6.5 HPC-Shared File Mode (`MDS_IFLAG_HPC_SHARED`)
For large AI checkpoints where thousands of GPUs write distinct byte slices into a single unified checkpoint file:
- Operators set the `MDS_IFLAG_HPC_SHARED` bit on an inode.
- Lattice automatically generates wide stripe geometries (e.g., 32+ DS nodes) and prioritizes RoCE/InfiniBand RDMA endpoints.
- Aggregates `LAYOUTCOMMIT` calls to prevent metadata serialization during checkpointing phases.

---

## 7. Comparative Technology Matrix

| Feature | Traditional NFS | Traditional pNFS | Lustre / GPFS | **pNFS-Lattice** |
|---|---|---|---|---|
| **MDS Scalability** | Single Node | Active/Passive Pair | Distributed (MDT) / Complex Paxos | **Active-Active Fleet (1-1000+)** |
| **Metadata Authority** | Local Disk / NVMe | Local Disk / SAN | Distributed Inode RocksDB/LNET | **RonDB Clustered In-Memory** |
| **Data Path** | Through Head Node | Direct to DS | Direct to OST / NSD | **Direct to DS (knfsd TCP/RDMA)** |
| **Client Requirement** | Standard NFS | Standard NFS | Proprietary Kernel Driver | **Standard Linux Kernel (NFSv4.2)** |
| **Storage Node Software** | N/A | Specialized / knfsd | Lustre OST / GPFS Daemon | **Unmodified Linux `knfsd`** |
| **Directory Lock Model** | POSIX Inode Mutex | POSIX Inode Mutex | Distributed Lock Manager (DLM) | **RonDB Atomic Interpreted Tuple** |
| **Metadata Search** | Recursive RPCs (`find`) | Recursive RPCs (`find`) | Robinhood / Inode Scans | **Pushdown ScanFilter (`mds-find`)** |

---

## 8. Summary of Benefits for Modern Workloads

1. **Massive AI Dataloader Throughput**: Eliminates directory lock contention during simultaneous dataset traversal.
2. **Accelerated Model Checkpointing**: HPC-Shared mode wide striping writes multi-terabyte checkpoints in seconds across NVMe Data Servers.
3. **Zero Vendor Lock-In**: Works out of the box with standard Linux clients and commodity server hardware.
4. **Elastic Cloud Deployment**: MDS daemons can be dynamically spun up during peak training runs and spun down when idle.
