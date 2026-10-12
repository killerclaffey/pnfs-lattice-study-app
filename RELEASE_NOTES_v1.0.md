# ⚡ v1.0.0 — Initial Release: pNFS & pNFS-Lattice Interactive Studio

We are excited to announce the initial release (**v1.0.0**) of the **pNFS & pNFS-Lattice Interactive Studio**, an open-source educational suite and simulation platform for mastering Parallel NFS (pNFS, RFC 5661 / RFC 7862), Flex Files (RFC 8435), and the active-active pNFS-Lattice scale-out metadata architecture.

---

### 🚀 Highlights & Features

* **Interactive Architecture Explorer:**
  * Real-time visual mapping of the four decoupled planes: Linux Kernel Clients (`nfs_layout_flexfiles`), Active-Active MDS Fleet (`lattice-pnfs`), RonDB Clustered Metadata Authority, and Commodity Data Servers (`knfsd`).
  * Live memory profiling inspector showcasing the **Wave-2 Heap Scratch** memory model (~75% reduction in per-worker memory footprint).

* **5-Phase Protocol Flow Simulator:**
  * Interactive step-by-step tracer following a file request from discovery (`fs_locations` / `NFS4ERR_MOVED`), fused `OPEN` + `LAYOUTGET`, direct client-to-DS parallel data streaming (bypassing the MDS), `LAYOUTCOMMIT`, to asynchronous stripe garbage collection (`gc_queue`).
  * Real-time XDR wire protocol representations for RFC 8435 Flex Files layouts.

* **Scale & Bottleneck Simulation Lab:**
  * High-concurrency AI/HPC workload modeling comparing Traditional NFS, Traditional pNFS, and pNFS-Lattice.
  * Real-time telemetry calculations for metadata IOPS (up to 1.5M+), aggregate storage bandwidth (GB/s), average latency (ms), and parent-directory lock contention.

* **Browser-Based Lattice CLI & Find-API Sandbox:**
  * Interactive terminal emulator with administrative and query tools (`mds-status`, `rondb-status`, `ds-pool`, `mds-admin hpc enable`).
  * Demonstrates parallel metadata search via `NdbScanFilter` predicate pushdown (`mds-find --size +1G`), cutting search times from minutes of POSIX walks to milliseconds.

* **Exam Mastery Quiz & Flashcards:**
  * 8-question certification knowledge check with instant scoring and architectural explanations.
  * 10 spaced-repetition flashcards covering memory models, database transactions, RFCs, and deployment topologies.

* **Comprehensive Technical Guide:**
  * Deep-dive documentation manual in `docs/PNFS_AND_LATTICE_GUIDE.md` covering internal tuple operations, `interpretedUpdateTuple`, and the NetApp/PEAK:AIO integration.

* **Zero-Dependency Architecture & Task Runner:**
  * Standard Python 3 HTTP server (`server.py`) requiring zero external pip dependencies.
  * CLI terminal companion (`cli.py`).
  * Fully managed via `just` (`just run`, `just cli`, `just test`, `just screenshot`).

---

### 📦 Installation & Quickstart

```bash
git clone https://github.com/killerclaffey/pnfs-lattice-study-app.git
cd pnfs-lattice-study-app

# Launch web dashboard
just run

# Launch CLI trainer
just cli
```
