/**
 * pNFS & pNFS-Lattice Interactive Study Studio Engine
 * Full client-side state machine, simulators, quiz engine, and terminal sandbox.
 */

// Global State
let globalData = null;
let currentFlashcardIndex = 0;
let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;

// Architectural Nodes Database
const ARCH_DETAILS = {
  client: {
    title: "Linux Kernel pNFS Client",
    badge: "Unmodified Kernel Stack",
    html: `
      <p>Standard Linux clients (RHEL, Ubuntu, Debian, Rocky) run native kernel NFS modules without any proprietary drivers or agents.</p>
      <div class="code-snippet">
# Mount options for pNFS Flex Files
mount -t nfs -o vers=4.2,minorversion=2,nconnect=8 mds01:/data /mnt/data
      </div>
      <p><strong>Core Kernel Drivers:</strong></p>
      <ul>
        <li><code>nfs_layout_flexfiles.ko</code>: Implements RFC 8435 Flex Files protocol driver.</li>
        <li><code>sunrpc.ko</code>: Handles NFSv4.1/4.2 sessions, compounds, and stateids.</li>
        <li><code>rpcrdma.ko</code>: Direct zero-copy RDMA transport to storage nodes.</li>
      </ul>
      <p><strong>Behavior:</strong> On mount, client establishes an NFSv4.2 session with an MDS. When opening files, it receives Flex Files layouts and communicates directly with target Data Servers over TCP or RDMA.</p>
    `
  },
  mds0: {
    title: "Lattice MDS Fleet (Active-Active)",
    badge: "User-Space C Daemon",
    html: `
      <p><strong>Binary:</strong> <code>lattice-pnfs</code> (located in <code>src/mds/main.c</code>).</p>
      <p>A lightweight, stateless multi-threaded user-space daemon that translates NFSv4.2 RPC COMPOUND requests into transactional RonDB queries.</p>
      <div class="code-snippet">
// Wave-2 Heap Scratch Memory Model (src/mds/rpc_server.c)
// Slots: 64 nfs4_op & 64 nfs4_result per worker thread
// Result slot size: ~13 KB (down from 524 KB legacy inlining)
// Memory footprint reduction: 75% per thread
      </div>
      <p><strong>Thread Groups:</strong></p>
      <ul>
        <li><code>RPC listeners</code>: Dispatches decoded NFS compounds to worker pool.</li>
        <li><code>Compound workers</code>: Executes <code>compound_process()</code> end-to-end.</li>
        <li><code>Catalogue I/O threads</code>: Drives NDB transactions via <code>catalogue_rondb_shim.cpp</code>.</li>
        <li><code>DS GC coordinator</code>: Drains <code>gc_queue</code> and issues background unlinks to DSes.</li>
      </ul>
    `
  },
  mds1: {
    title: "MDS Fused Operations & Fastpath",
    badge: "Latency Optimization",
    html: `
      <p>To maximize IOPS for AI/ML pipelines, Lattice implements op-fusion and fastpath algorithms:</p>
      <ul>
        <li><strong>Fused OPEN(CREATE) + LAYOUTGET:</strong> Pre-allocates stripe coordinates so layouts are returned immediately without extra network hops.</li>
        <li><strong>Newfile Fastpath:</strong> Skips conflict-recall scans for newly created files, eliminating redundant catalogue queries.</li>
        <li><strong>Fused LOOKUP + REMOVE:</strong> Collapses permission checking and unlinking into a single atomic NDB transaction.</li>
      </ul>
    `
  },
  mdsN: {
    title: "Elastic Horizontal Scalability",
    badge: "No Coordinator Needed",
    html: `
      <p>Traditional parallel filesystems (like Ceph MDS or Lustre MDS) require complex leader elections (Paxos/Raft) or active-passive standby pairs.</p>
      <p><strong>Lattice Innovation:</strong> Because RonDB acts as the distributed transactional authority with row-level locking, 10, 50, or 100+ MDS daemons can be spun up or down dynamically during AI training without re-sharding or leader renegotiation.</p>
    `
  },
  rondb_tables: {
    title: "RonDB Catalogue Authority",
    badge: "MySQL NDB Cluster Engine",
    html: `
      <p><strong>Source:</strong> <code>src/catalogue/catalogue_rondb_shim.cpp</code></p>
      <p>RonDB is an in-memory, shared-nothing, multi-master transactional engine. It guarantees strict ACID compliance across all metadata operations.</p>
      <p><strong>Atomic Parent Directory Updates:</strong></p>
      <div class="code-snippet">
// interpretedUpdateTuple: Atomic incValue / subValue
// Updates parent's nlink, mtime, ctime, and change counter
// inside the NDB storage engine tuple without read-modify-write!
      </div>
      <p><strong>Core Tables:</strong></p>
      <ul>
        <li><code>inodes</code>: Attributes, permissions, size, modification timestamps.</li>
        <li><code>dirents</code>: Parent fileid + name -> child fileid + type.</li>
        <li><code>inline_data</code>: Stores small files and symlink targets directly in DB.</li>
      </ul>
    `
  },
  stripe_maps: {
    title: "stripe_maps & Placement Engine",
    badge: "RFC 8435 Metadata Table",
    html: `
      <p>Stores the file-to-storage stripe layout mapping for each file.</p>
      <div class="code-snippet">
Table: stripe_maps
- fileid: uint64 (Primary Key)
- stripe_count: uint32
- mirror_count: uint32
- stripe_unit: uint64 (e.g. 1 MiB or 4 MiB)
- ds_entries: ordered array of (ds_id, filehandle, ip_endpoints)
      </div>
      <p>Placement calculations (<code>src/mds/placement.c</code>) automatically balance I/O across available healthy Data Servers.</p>
    `
  },
  gc_queue: {
    title: "gc_queue & Asynchronous DS Cleanup",
    badge: "Orphan Stripe Sweeper",
    html: `
      <p><strong>Source:</strong> <code>src/mds/ds_gc.c</code></p>
      <p>When a client unlinks a striped file with <code>REMOVE</code>, immediate synchronous removal of stripes across 32 data servers would stall the client RPC.</p>
      <p><strong>Lattice Solution:</strong> The MDS deletes the file from <code>inodes</code> and <code>dirents</code> instantly in 1 NDB transaction, and pushes the stripe IDs into the <code>gc_queue</code> table. Background GC workers then issue non-blocking <code>NFS UNLINK</code> calls to data servers.</p>
    `
  },
  ds0: {
    title: "Data Server 01 (knfsd)",
    badge: "Commodity Linux Storage",
    html: `
      <p>Data Servers run completely unmodified Linux kernel NFS servers (<code>knfsd</code>).</p>
      <p><strong>Protocol Support:</strong> Speaks NFSv3 or NFSv4.1. Accepts TCP and RoCE/InfiniBand RDMA connections directly from compute clients.</p>
      <p><strong>Probed Wire Limits:</strong> Lattice periodically probes each DS with <code>NFSv3 FSINFO</code> to auto-tune <code>rtmax</code> and <code>wtmax</code> transfer sizes (typically 1 MiB).</p>
    `
  },
  ds1: {
    title: "Data Server 02 (Parallel Stripe)",
    badge: "Active Mirror / Striping",
    html: `
      <p>Shares data payload load in parallel with other DS nodes. With Flex Files, a file can be striped round-robin across DS-01, DS-02, and DS-N, providing linear aggregate I/O bandwidth up to 100+ GB/s.</p>
    `
  },
  dsN: {
    title: "Data Server Fleet Scale-Out",
    badge: "Linear Bandwidth Scaling",
    html: `
      <p>Storage capacity and bandwidth scale independently of the metadata tier. Adding 10 more NVMe data servers increases total read/write throughput by 100+ GB/s without touching the MDS or RonDB configuration.</p>
    `
  }
};

// Protocol Steps Data
const PROTOCOL_STEPS = [
  {
    step: 1,
    title: "NFSv4 Referrals & Client Discovery",
    desc: "A client mounts the filesystem export. If the contacted MDS is under heavy load or client needs referral redirection, the MDS returns an NFSv4 referral (fs_locations attribute and NFS4ERR_MOVED error) pointing the client to an active MDS in the cluster.",
    codeFile: "RFC 5661 / NFSv4.1 fs_locations referral",
    code: `// Client sends LOOKUP / GETATTR
C -> S: COMPOUND [PUTFH root_fh, LOOKUP "data", GETATTR fs_locations]
// Server replies with referral to active Lattice MDS node
S -> C: COMPOUND [NFS4ERR_MOVED, fs_locations: { server: "mds-02.cluster.local", rootpath: "/data" }]
// Client seamlessly establishes session with mds-02`,
    anim: { client: true, mds: true, rondb: false, ds: false }
  },
  {
    step: 2,
    title: "OPEN & Fused LAYOUTGET",
    desc: "The client opens the target file. The MDS resolves the file's inode and dirent in RonDB in a single transaction. Under Lattice's fused layout path, the MDS generates the Flex Files layout (DS addresses, stripe pattern, and NFS file handles) in the same round-trip.",
    codeFile: "RFC 8435 Flex Files Layout Wire Protocol",
    code: `C -> MDS: COMPOUND [
    PUTFH dir_fh,
    OPEN (OPEN4_CREATE, claim_type=CLAIM_NULL, name="checkpoint.ckpt"),
    LAYOUTGET (type=LAYOUT4_FLEX_FILES, iomode=LAYOUTIOMODE4_RW, offset=0, length=UINT64_MAX)
]
MDS -> C: COMPOUND [
    OPEN: { stateid: { seqid: 1, other: 0x4a9b... } },
    LAYOUTGET: {
        return_on_close: TRUE,
        device_id: 0x0001000000000001,
        ff_layout: [
            stripe 0: { ds_ip: "10.0.1.101:2049", fh: 0x1f0a... },
            stripe 1: { ds_ip: "10.0.1.102:2049", fh: 0x2b1c... }
        ]
    }
]`,
    anim: { client: true, mds: true, rondb: true, ds: false }
  },
  {
    step: 3,
    title: "Direct Client ↔ DS Parallel I/O",
    desc: "The client uses the layout map to stream data stripes directly to the Data Servers using parallel NFS READ/WRITE calls over TCP or RDMA. The MDS is completely bypassed during this high-bandwidth data movement phase.",
    codeFile: "NFSv3 / NFSv4.1 Direct DS Data Path",
    code: `// Direct Client Parallel Writes (MDS completely bypassed!)
Client -> DS-01 (RDMA): WRITE (fh=0x1f0a..., offset=0, len=1048576, data=[...])
Client -> DS-02 (RDMA): WRITE (fh=0x2b1c..., offset=1048576, len=1048576, data=[...])

DS-01 -> Client: WRITE_REPLY (count=1048576, committed=FILE_SYNC)
DS-02 -> Client: WRITE_REPLY (count=1048576, committed=FILE_SYNC)
// Aggregate throughput scales linearly with number of DS nodes`,
    anim: { client: true, mds: false, rondb: false, ds: true }
  },
  {
    step: 4,
    title: "LAYOUTCOMMIT & LAYOUTRETURN",
    desc: "When writes are finished, the client notifies the MDS with LAYOUTCOMMIT, updating the final file size and modification timestamp in RonDB in a single atomic transaction. On CLOSE, the layout stateid is released via LAYOUTRETURN.",
    codeFile: "NFSv4.2 Metadata Finalization",
    code: `C -> MDS: COMPOUND [
    PUTFH file_fh,
    LAYOUTCOMMIT (offset=0, length=2097152000, new_size=2097152000, mtime=NOW),
    LAYOUTRETURN (reclaim=FALSE, layout_type=LAYOUT4_FLEX_FILES, iomode=LAYOUTIOMODE4_RW)
]
// MDS commits updated inode size to RonDB in 1 atomic transaction:
// UPDATE inodes SET size=2097152000, mtime=NOW WHERE fileid=10042
MDS -> C: COMPOUND [NFS4_OK, LAYOUTCOMMIT_REPLY, LAYOUTRETURN_REPLY]`,
    anim: { client: true, mds: true, rondb: true, ds: false }
  },
  {
    step: 5,
    title: "Asynchronous Stripe Garbage Collection",
    desc: "When a file is removed (REMOVE), the MDS unlinks the inode from dirents in RonDB instantly (zero client latency) and enqueues stripe IDs into the gc_queue table. Background workers drain this queue and issue asynchronous UNLINK calls to the data servers.",
    codeFile: "Lattice ds_gc.c Background Pipeline",
    code: `C -> MDS: COMPOUND [PUTFH dir_fh, REMOVE "checkpoint.ckpt"]
// MDS executes atomic NDB transaction:
// 1. DELETE FROM dirents WHERE parent=501 AND name='checkpoint.ckpt'
// 2. interpretedUpdateTuple: parent nlink--, change++
// 3. INSERT INTO gc_queue (fileid, ds_id, stripe_fh) VALUES (...)
MDS -> C: COMPOUND [NFS4_OK] // Client returns immediately!

// Background worker thread pool (ds_gc.c):
Worker -> DS-01: NFS UNLINK (fh=0x1f0a...)
Worker -> DS-02: NFS UNLINK (fh=0x2b1c...)`,
    anim: { client: false, mds: true, rondb: true, ds: true }
  }
];

let currentProtocolStep = 1;

// Technical Glossary Data
const GLOSSARY_ITEMS = [
  {
    term: "pNFS (Parallel NFS)",
    rfc: "RFC 5661 (NFSv4.1) / RFC 7862 (NFSv4.2)",
    def: "An extension to the Network File System that separates the control/metadata path from the data path, allowing clients to perform parallel I/O directly with storage data servers."
  },
  {
    term: "Flex Files Layout",
    rfc: "RFC 8435",
    def: "A flexible pNFS layout specification allowing commodity Linux kernel NFS servers (knfsd) to serve as Data Servers with support for mirroring, multipath failover, and client I/O error reporting."
  },
  {
    term: "pNFS-Lattice",
    rfc: "Open Source / PEAK:AIO / LANL / CMU",
    def: "An active-active, user-space, scale-out metadata server architecture for pNFS Flex Files that uses RonDB as a shared, transactional source of truth."
  },
  {
    term: "MDS (Metadata Server)",
    rfc: "RFC 5661",
    def: "The authority responsible for the filesystem namespace, directories, file permissions, authentication, locking, and issuing layout maps to clients."
  },
  {
    term: "DS (Data Server)",
    rfc: "RFC 5661 / RFC 8435",
    def: "The storage entity that stores raw data stripes and serves direct read and write requests from clients without routing traffic through the MDS."
  },
  {
    term: "RonDB",
    rfc: "MySQL NDB Cluster Engine",
    def: "An ultra-high-throughput, distributed in-memory and NVMe clustered database engine used by Lattice to provide ACID metadata transactions and row-level locking."
  },
  {
    term: "interpretedUpdateTuple",
    rfc: "RonDB NDB API",
    def: "An atomic database operation that modifies table column values (like incValue/subValue) directly inside the database storage engine tuple, preventing read-modify-write race conditions."
  },
  {
    term: "Wave-2 Heap Scratch",
    rfc: "Lattice Memory Architecture",
    def: "A redesigned per-worker memory layout in Lattice that moves large payload scratch outside the op/result union, shrinking result slots from 524 KB to ~13 KB."
  },
  {
    term: "HPC-Shared File Mode",
    rfc: "Lattice MDS_IFLAG_HPC_SHARED",
    def: "An opt-in per-inode mode optimizing N-to-1 parallel writes (many compute nodes writing distinct byte ranges to the same file) with wide striping and RDMA DS endpoints."
  },
  {
    term: "LAYOUTGET / LAYOUTCOMMIT",
    rfc: "RFC 5661 / RFC 8435",
    def: "Core pNFS operations where a client obtains a byte-range stripe placement layout from the MDS, and commits modified size/mtime attributes back to the MDS upon completion."
  },
  {
    term: "CB_LAYOUTRECALL",
    rfc: "RFC 5661 Backchannel",
    def: "A callback issued from the MDS to a client requesting that an outstanding layout grant be returned, used for cache invalidation or storage rebalancing."
  },
  {
    term: "find-API (mds-find / mds-apid)",
    rfc: "Lattice Read-Only Query Service",
    def: "A high-performance metadata search interface that pushes attribute predicates down into RonDB's NdbScanFilter across all cluster fragments in parallel."
  }
];

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  fetchInitialData();
  renderGlossary();
  setupTerminal();
  updateProtocolStep(1);
  showArchDetail("mds0");
  runSimulation();
});

// Tab Switcher
function initTabs() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const targetId = `tab-${tab.dataset.tab}`;
      document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.classList.remove("active");
      });
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }
    });
  });
}

// Fetch Initial Data from Server API
async function fetchInitialData() {
  try {
    const res = await fetch("/api/data");
    if (!res.ok) throw new Error("API fetch failed");
    globalData = await res.json();
    renderStudyTopics();
    updateFlashcard();
  } catch (err) {
    console.warn("Using offline fallback data:", err);
  }
}

// Architecture Detail Inspector
function showArchDetail(key) {
  const data = ARCH_DETAILS[key];
  if (!data) return;

  const titleEl = document.getElementById("detailTitle");
  const contentEl = document.getElementById("detailContent");

  titleEl.innerHTML = `<span class="badge highlight" style="margin-right: 0.5rem;">${data.badge}</span> ${data.title}`;
  contentEl.innerHTML = data.html;

  // Highlight active node
  document.querySelectorAll(".arch-node").forEach(node => {
    node.classList.remove("active-node");
  });
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add("active-node");
  }
}

// Protocol Flow Simulator Controls
function updateProtocolStep(stepNum) {
  currentProtocolStep = stepNum;
  const step = PROTOCOL_STEPS[stepNum - 1];

  // Update Buttons Nav
  document.querySelectorAll(".flow-step-btn").forEach((btn, idx) => {
    if (idx + 1 === stepNum) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update Text
  document.getElementById("stepBadge").innerText = `PHASE ${step.step} OF 5`;
  document.getElementById("stepHeading").innerText = step.title;
  document.getElementById("stepDesc").innerText = step.desc;
  document.getElementById("codeFileName").innerText = step.codeFile;
  document.getElementById("stepCodeBlock").innerText = step.code;

  document.getElementById("btnPrevStep").disabled = (stepNum === 1);
  document.getElementById("btnNextStep").disabled = (stepNum === PROTOCOL_STEPS.length);

  // Render Animated Visual
  renderFlowVisual(step);
}

function navigateStep(delta) {
  const nextStep = currentProtocolStep + delta;
  if (nextStep >= 1 && nextStep <= PROTOCOL_STEPS.length) {
    updateProtocolStep(nextStep);
  }
}

document.querySelectorAll(".flow-step-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const step = parseInt(btn.dataset.step, 10);
    updateProtocolStep(step);
  });
});

function copyStepCode() {
  const code = document.getElementById("stepCodeBlock").innerText;
  navigator.clipboard.writeText(code).then(() => {
    alert("Protocol wire specification copied to clipboard!");
  });
}

function renderFlowVisual(step) {
  const area = document.getElementById("flowVisualArea");
  area.innerHTML = `
    <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; gap: 1rem;">
      <div style="display: flex; justify-content: space-around; align-items: center;">
        <div style="padding: 0.75rem 1.25rem; background: #1e293b; border-radius: 8px; border: 1px solid ${step.anim.client ? '#38bdf8' : '#334155'}; text-align: center; box-shadow: ${step.anim.client ? '0 0 15px rgba(56, 189, 248, 0.4)' : 'none'}">
          <div style="font-size: 1.5rem;">💻</div>
          <div style="font-size: 0.8rem; font-weight: bold; color: ${step.anim.client ? '#38bdf8' : '#94a3b8'}">Client (NFSv4.2)</div>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <span style="font-size: 0.7rem; font-family: monospace; color: ${step.anim.mds ? '#38bdf8' : '#64748b'}">
            ${step.step === 3 ? 'Bypassed ➔' : 'RPC ⇄'}
          </span>
          <div style="width: 80px; height: 2px; background: ${step.anim.mds ? '#38bdf8' : '#334155'};"></div>
        </div>

        <div style="padding: 0.75rem 1.25rem; background: #1e293b; border-radius: 8px; border: 1px solid ${step.anim.mds ? '#c084fc' : '#334155'}; text-align: center; box-shadow: ${step.anim.mds ? '0 0 15px rgba(192, 132, 252, 0.4)' : 'none'}">
          <div style="font-size: 1.5rem;">⚡</div>
          <div style="font-size: 0.8rem; font-weight: bold; color: ${step.anim.mds ? '#c084fc' : '#94a3b8'}">Lattice MDS Fleet</div>
        </div>
      </div>

      <div style="display: flex; justify-content: center; align-items: center;">
        <div style="padding: 0.75rem 1.5rem; background: #0f172a; border-radius: 8px; border: 1px solid ${step.anim.rondb ? '#10b981' : '#334155'}; text-align: center; box-shadow: ${step.anim.rondb ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none'}">
          <div style="font-size: 1.3rem;">🗄️</div>
          <div style="font-size: 0.8rem; font-weight: bold; color: ${step.anim.rondb ? '#10b981' : '#94a3b8'}">RonDB Clustered Metadata (ACID)</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-around; align-items: center;">
        <div style="padding: 0.75rem 1.25rem; background: #1e293b; border-radius: 8px; border: 1px solid ${step.anim.ds ? '#10b981' : '#334155'}; text-align: center; box-shadow: ${step.anim.ds ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none'}">
          <div style="font-size: 1.4rem;">💾</div>
          <div style="font-size: 0.8rem; font-weight: bold; color: ${step.anim.ds ? '#10b981' : '#94a3b8'}">DS-01 (knfsd)</div>
        </div>
        <div style="padding: 0.75rem 1.25rem; background: #1e293b; border-radius: 8px; border: 1px solid ${step.anim.ds ? '#10b981' : '#334155'}; text-align: center; box-shadow: ${step.anim.ds ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none'}">
          <div style="font-size: 1.4rem;">💾</div>
          <div style="font-size: 0.8rem; font-weight: bold; color: ${step.anim.ds ? '#10b981' : '#94a3b8'}">DS-02 (knfsd)</div>
        </div>
        <div style="padding: 0.75rem 1.25rem; background: #1e293b; border-radius: 8px; border: 1px solid ${step.anim.ds ? '#10b981' : '#334155'}; text-align: center; box-shadow: ${step.anim.ds ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none'}">
          <div style="font-size: 1.4rem;">💾</div>
          <div style="font-size: 0.8rem; font-weight: bold; color: ${step.anim.ds ? '#10b981' : '#94a3b8'}">DS-N (knfsd)</div>
        </div>
      </div>
    </div>
  `;
}

// Workload Simulation Engine
async function runSimulation() {
  const clients = parseInt(document.getElementById("sliderClients").value, 10);
  const mdsNodes = parseInt(document.getElementById("sliderMds").value, 10);
  const dsNodes = parseInt(document.getElementById("sliderDs").value, 10);
  const mode = document.querySelector('input[name="simArch"]:checked').value;

  document.getElementById("valClients").innerText = clients.toLocaleString();
  document.getElementById("valMds").innerText = mdsNodes;
  document.getElementById("valDs").innerText = dsNodes;

  const groupMds = document.getElementById("groupMds");
  const labelMode = document.getElementById("labelMode");

  if (mode === "trad_nfs") {
    groupMds.style.opacity = "0.3";
    groupMds.style.pointerEvents = "none";
    labelMode.innerText = "Traditional NFS";
    labelMode.className = "badge danger";
  } else if (mode === "trad_pnfs") {
    groupMds.style.opacity = "0.3";
    groupMds.style.pointerEvents = "none";
    labelMode.innerText = "Traditional pNFS";
    labelMode.className = "badge highlight";
  } else {
    groupMds.style.opacity = "1";
    groupMds.style.pointerEvents = "auto";
    labelMode.innerText = "pNFS-Lattice";
    labelMode.className = "badge success";
  }

  try {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clients, mds_nodes: mdsNodes, ds_nodes: dsNodes, mode })
    });
    const sim = await res.json();
    renderSimulationResults(sim);
  } catch (e) {
    // Local calculation fallback
    renderSimulationResultsLocal(clients, mdsNodes, dsNodes, mode);
  }
}

function renderSimulationResults(sim) {
  const resIops = document.getElementById("resIops");
  const resBw = document.getElementById("resBandwidth");
  const resLat = document.getElementById("resLatency");
  const resLock = document.getElementById("resContention");
  const badge = document.getElementById("bottleneckBadge");
  const expl = document.getElementById("bottleneckExplanation");

  resIops.innerHTML = `${sim.metadata_iops.toLocaleString()} <span class="unit">IOPS</span>`;
  resBw.innerHTML = `${sim.data_bandwidth_gbps.toFixed(1)} <span class="unit">GB/s</span>`;
  resLat.innerHTML = `${sim.avg_latency_ms.toFixed(2)} <span class="unit">ms</span>`;

  if (sim.is_bottlenecked) {
    badge.innerText = "CRITICAL BOTTLENECK";
    badge.className = "badge danger";
    resLock.innerHTML = `Serialized <span class="unit">(94% lock wait)</span>`;
    expl.innerHTML = `
      <strong style="color: #f43f5e;">⚠️ Architecture Bottleneck Detected:</strong><br>
      ${sim.mode === "trad_nfs" 
        ? "Monolithic NFS Server is overwhelmed. A single host handles both directory mutations and payload bytes, leading to severe lock contention and queue stalls." 
        : "Traditional pNFS Metadata Bottleneck: While Data Servers provide striping bandwidth, the single static MDS cannot keep up with thousands of concurrent file open/create requests."}
    `;
  } else {
    badge.innerText = "Zero Bottleneck (Scale-Out)";
    badge.className = "badge success";
    resLock.innerHTML = `Atomic Tuple <span class="unit">(0.0% wait)</span>`;
    expl.innerHTML = `
      <strong style="color: #10b981;">✅ High-Concurrency AI/HPC Performance:</strong><br>
      The active-active fleet of ${sim.effective_mds} Lattice MDS daemons distributes RPC processing across nodes, while RonDB executes interpreted parent-directory mutations atomically. Throughput scales linearly without a single point of serialization.
    `;
  }
}

function renderSimulationResultsLocal(clients, mdsNodes, dsNodes, mode) {
  // Offline local fallback calculator
  let maxIops = mode === "trad_nfs" ? 30000 : (mode === "trad_pnfs" ? 65000 : mdsNodes * 95000);
  let maxBw = mode === "trad_nfs" ? 4.5 : (mode === "trad_pnfs" ? dsNodes * 6.0 : dsNodes * 12.0);
  let isBottle = (mode === "trad_nfs" && clients > 150) || (mode === "trad_pnfs" && clients > 300);
  let latency = mode === "lattice" ? 0.12 : (isBottle ? 4.8 : 0.6);

  renderSimulationResults({
    mode,
    effective_mds: mode === "lattice" ? mdsNodes : 1,
    metadata_iops: Math.min(clients * 800, maxIops),
    data_bandwidth_gbps: Math.min(clients * 0.2, maxBw),
    avg_latency_ms: latency,
    is_bottlenecked: isBottle
  });
}

// Deep Study Modules Rendering
function renderStudyTopics() {
  if (!globalData || !globalData.topics) return;
  const list = document.getElementById("topicList");
  list.innerHTML = "";

  globalData.topics.forEach((t, idx) => {
    const li = document.createElement("li");
    li.className = `topic-item ${idx === 0 ? 'active' : ''}`;
    li.innerText = t.title;
    li.onclick = () => {
      document.querySelectorAll(".topic-item").forEach(item => item.classList.remove("active"));
      li.classList.add("active");
      displayTopicContent(t);
    };
    list.appendChild(li);
  });

  displayTopicContent(globalData.topics[0]);
}

function displayTopicContent(topic) {
  document.getElementById("topicSubtitle").innerText = topic.subtitle;
  document.getElementById("topicTitle").innerText = topic.title;

  let html = `<p class="topic-summary" style="font-size: 1.1rem; color: #7dd3fc; margin-bottom: 1.5rem;">${topic.summary}</p>`;
  html += `<div>${topic.content.replace(/\n\n/g, '<br><br>')}</div>`;

  html += `<div class="study-takeaways">
    <h4>Key Architectural Takeaways</h4>
    <ul>
      ${topic.key_takeaways.map(k => `<li>${k}</li>`).join('')}
    </ul>
  </div>`;

  document.getElementById("topicBody").innerHTML = html;
}

// Flashcards Engine
function updateFlashcard() {
  if (!globalData || !globalData.flashcards) return;
  const cards = globalData.flashcards;
  const card = cards[currentFlashcardIndex];

  document.getElementById("cardCurrentNum").innerText = currentFlashcardIndex + 1;
  document.getElementById("cardTotalNum").innerText = cards.length;
  document.getElementById("cardCategory").innerText = card.category;
  document.getElementById("cardFrontText").innerText = card.front;
  document.getElementById("cardBackText").innerText = card.back;

  const cardEl = document.getElementById("activeFlashcard");
  cardEl.classList.remove("flipped");
}

function flipFlashcard() {
  document.getElementById("activeFlashcard").classList.toggle("flipped");
}

function nextFlashcard() {
  if (!globalData || !globalData.flashcards) return;
  currentFlashcardIndex = (currentFlashcardIndex + 1) % globalData.flashcards.length;
  updateFlashcard();
}

function prevFlashcard() {
  if (!globalData || !globalData.flashcards) return;
  currentFlashcardIndex = (currentFlashcardIndex - 1 + globalData.flashcards.length) % globalData.flashcards.length;
  updateFlashcard();
}

// Quiz Engine
function startQuiz() {
  quizIndex = 0;
  quizScore = 0;
  quizAnswered = false;

  document.getElementById("quizIntroState").style.display = "none";
  document.getElementById("quizResultState").style.display = "none";
  document.getElementById("quizActiveState").style.display = "block";

  renderQuizQuestion();
}

function renderQuizQuestion() {
  const quiz = globalData.quiz;
  const q = quiz[quizIndex];
  quizAnswered = false;

  document.getElementById("quizStepText").innerText = `Question ${quizIndex + 1} of ${quiz.length}`;
  document.getElementById("quizLiveScore").innerText = quizScore;
  document.getElementById("quizProgressFill").style.width = `${((quizIndex + 1) / quiz.length) * 100}%`;
  document.getElementById("quizQuestionText").innerText = q.question;

  const optionsList = document.getElementById("quizOptionsList");
  optionsList.innerHTML = "";

  q.options.forEach((opt, optIdx) => {
    const btn = document.createElement("button");
    btn.className = "quiz-option-btn";
    btn.innerHTML = `<strong>${String.fromCharCode(65 + optIdx)}.</strong> ${opt}`;
    btn.onclick = () => selectQuizAnswer(optIdx, btn);
    optionsList.appendChild(btn);
  });

  document.getElementById("quizExplanationCard").style.display = "none";
}

function selectQuizAnswer(chosenIdx, clickedBtn) {
  if (quizAnswered) return;
  quizAnswered = true;

  const q = globalData.quiz[quizIndex];
  const buttons = document.querySelectorAll(".quiz-option-btn");
  buttons.forEach(b => b.disabled = true);

  const explCard = document.getElementById("quizExplanationCard");
  const explTitle = document.getElementById("explTitle");
  const explText = document.getElementById("explText");

  if (chosenIdx === q.correct) {
    clickedBtn.classList.add("selected-correct");
    quizScore++;
    document.getElementById("quizLiveScore").innerText = quizScore;
    explTitle.innerText = "✓ Correct Answer!";
    explTitle.className = "expl-title correct";
  } else {
    clickedBtn.classList.add("selected-wrong");
    buttons[q.correct].classList.add("selected-correct");
    explTitle.innerText = `✗ Incorrect. Correct option is ${String.fromCharCode(65 + q.correct)}`;
    explTitle.className = "expl-title wrong";
  }

  explText.innerText = q.explanation;
  explCard.style.display = "block";
}

function nextQuestion() {
  quizIndex++;
  if (quizIndex < globalData.quiz.length) {
    renderQuizQuestion();
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  document.getElementById("quizActiveState").style.display = "none";
  document.getElementById("quizResultState").style.display = "block";

  const total = globalData.quiz.length;
  const pct = Math.round((quizScore / total) * 100);

  document.getElementById("quizFinalPercent").innerText = `${pct}%`;
  const title = document.getElementById("quizResultTitle");
  const summary = document.getElementById("quizResultSummary");

  if (pct >= 85) {
    title.innerText = "Outstanding! Storage Architect Level";
    summary.innerText = `You scored ${quizScore} out of ${total}. You have a firm grasp of pNFS, Flex Files (RFC 8435), RonDB atomicity, and Lattice scale-out internals.`;
  } else if (pct >= 60) {
    title.innerText = "Proficient Knowledge";
    summary.innerText = `You scored ${quizScore} out of ${total}. Good work! Review the flashcards and RonDB catalogue section to solidify details.`;
  } else {
    title.innerText = "Study Required";
    summary.innerText = `You scored ${quizScore} out of ${total}. Review the Deep Study modules and retry to reinforce the concepts.`;
  }
}

// Glossary Filter
function renderGlossary(filter = "") {
  const grid = document.getElementById("glossaryGrid");
  grid.innerHTML = "";

  const q = filter.toLowerCase().trim();
  const filtered = GLOSSARY_ITEMS.filter(item => 
    item.term.toLowerCase().includes(q) || 
    item.def.toLowerCase().includes(q) ||
    item.rfc.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: #94a3b8; text-align: center; padding: 2rem;">No matching terms found.</div>`;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement("div");
    card.className = "glossary-item";
    card.innerHTML = `
      <h4>${item.term}</h4>
      <div class="glossary-rfc">${item.rfc}</div>
      <p>${item.def}</p>
    `;
    grid.appendChild(card);
  });
}

function filterGlossary() {
  const query = document.getElementById("glossarySearch").value;
  renderGlossary(query);
}

// Interactive Terminal Sandbox
function setupTerminal() {
  const input = document.getElementById("terminalInput");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const cmd = input.value.trim();
      if (cmd) {
        executeTerminalCommand(cmd);
        input.value = "";
      }
    }
  });
}

function focusTerminalInput() {
  document.getElementById("terminalInput").focus();
}

function executeTerminalCommand(raw) {
  const out = document.getElementById("terminalOutput");
  out.innerHTML += `\n<span style="color: #38bdf8;">admin@lattice-node-01:~$</span> ${escapeHtml(raw)}\n`;

  const parts = raw.split(" ");
  const verb = parts[0].toLowerCase();

  switch (verb) {
    case "help":
      out.innerHTML += `Available Simulated Commands:
  • mds-status             - Show active-active MDS fleet and heartbeat health
  • rondb-status           - Display RonDB cluster nodes, fragments, and transaction stats
  • ds-pool                - Inspect registered knfsd Data Servers and probed I/O limits
  • mds-find [filters]     - Execute parallel predicate pushdown query (e.g. mds-find --size +1G)
  • mds-admin hpc [action] - Toggle or inspect MDS_IFLAG_HPC_SHARED on checkpoints
  • cat-inspect inode <id> - Inspect low-level NDB tuple attributes
  • clear                  - Clear terminal screen\n`;
      break;

    case "mds-status":
      out.innerHTML += `Lattice MDS Daemon Fleet (Cluster: lattice-prod-uswest):
  NODE ID   LISTEN SOCKET        ROLE           STATE    LOAD     HEARTBEAT
  mds-01    10.0.1.10:2049/tcp   Active Worker  ONLINE   14.2%    < 1s ago
  mds-02    10.0.1.11:2049/tcp   Active Worker  ONLINE   18.7%    < 1s ago
  mds-03    10.0.1.12:2049/tcp   Active Worker  ONLINE   12.1%    < 1s ago
  mds-04    10.0.1.13:2049/tcp   Active Worker  ONLINE   15.9%    < 1s ago
Catalogue: RonDB Cluster (4 Data Nodes, 2 API Nodes) - Latency: 0.14ms\n`;
      break;

    case "rondb-status":
      out.innerHTML += `RonDB Cluster Status (MySQL NDB Cluster Engine 8.0.35-ndb):
  DATA NODE   STATUS   FRAGMENTS   RAM USED / MAX       TXN / SEC
  Node 1      ONLINE   8           18.4 GB / 64 GB      148,200 txn/s
  Node 2      ONLINE   8           18.3 GB / 64 GB      147,900 txn/s
  Node 3      ONLINE   8           18.5 GB / 64 GB      149,100 txn/s
  Node 4      ONLINE   8           18.4 GB / 64 GB      148,800 txn/s
  Atomic interpretedUpdateTuple Operations: 540,290/s (0 lock contention stalls)\n`;
      break;

    case "ds-pool":
      out.innerHTML += `Data Server (knfsd) Storage Pool:
  DS ID    IP ENDPOINT       PROTO   RTMAX / WTMAX   HEALTH   STRIPES HOSTED
  ds-01    10.0.2.201:2049   RDMA    1048576 / 1048576 ONLINE   42,190
  ds-02    10.0.2.202:2049   RDMA    1048576 / 1048576 ONLINE   42,185
  ds-03    10.0.2.203:2049   RDMA    1048576 / 1048576 ONLINE   42,192
  ds-04    10.0.2.204:2049   RDMA    1048576 / 1048576 ONLINE   42,188
  Storage driver: nfs_layout_flexfiles (RFC 8435) via kernel knfsd\n`;
      break;

    case "mds-find":
      out.innerHTML += `Executing mds-find via NdbScanFilter predicate pushdown (LM_CommittedRead)...
  [Pushed predicate: size >= 1073741824 bytes across 32 fragments]
  Scan completed in 4.2ms (Zero POSIX directory walk RPCs):
  • /data/models/llama3-70b/shard_01.bin [14.2 GB] - mtime: 2026-09-29 11:42:00
  • /data/models/llama3-70b/shard_02.bin [14.2 GB] - mtime: 2026-09-29 11:42:01
  • /data/checkpoints/gpt-run-42.ckpt     [88.4 GB] - mtime: 2026-09-29 12:15:30
  3 matches found across 14,280,000 files in cluster catalogue.\n`;
      break;

    case "mds-admin":
      if (parts[1] === "hpc") {
        if (parts[2] === "enable") {
          const path = parts[3] || "/data/checkpoints/run-01.ckpt";
          out.innerHTML += `Setting MDS_IFLAG_HPC_SHARED on ${path}...
  ✓ Inode flag updated in RonDB tuple.
  ✓ Wide stripe geometry (32 DS stripes, RDMA direct) assigned.
  ✓ Aggregated LAYOUTCOMMIT enabled for N-to-1 parallel compute writes.\n`;
        } else {
          out.innerHTML += `Usage: mds-admin hpc enable <path> | mds-admin hpc status <path>\n`;
        }
      } else {
        out.innerHTML += `Usage: mds-admin [subcommand]\n`;
      }
      break;

    case "cat-inspect":
      const id = parts[2] || "10042";
      out.innerHTML += `RonDB Tuple Dump for Inode: ${id}
  FileID: ${id}
  Parent FileID: 501
  Mode: 0100644 (-rw-r--r--)
  Owner UID/GID: 1000:1000
  Size: 4294967296 bytes (4 GiB)
  Change Counter: 194
  Flags: 0x0001 (MDS_IFLAG_HPC_SHARED)
  Layout Type: LAYOUT4_FLEX_FILES
  Stripes: 8 DS mirrors (ds-01..ds-08)\n`;
      break;

    case "clear":
      out.innerHTML = "";
      break;

    default:
      out.innerHTML += `Command not recognized: '${verb}'. Type 'help' to see valid commands.\n`;
      break;
  }

  // Scroll to bottom
  const screen = document.getElementById("terminalScreen");
  screen.scrollTop = screen.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
