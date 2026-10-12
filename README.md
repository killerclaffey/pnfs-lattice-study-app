# pNFS & pNFS-Lattice Interactive Study Environment

An interactive, full-stack educational and simulation suite designed to help engineers, architects, and researchers master **Parallel NFS (pNFS)**, **RFC 8435 Flex Files**, and the **pNFS-Lattice** scale-out metadata architecture.

---

## Quick Start with `just`

This project is fully managed using [`just`](https://github.com/casey/just).

```bash
# 1. Inspect available recipes
just

# 2. Launch the Interactive Web Study Studio (default: http://localhost:8080)
just run

# 3. Launch the Terminal Interactive Study Companion (Flashcards & Quiz)
just cli

# 4. Run the automated test suite
just test

# 5. Display architectural summary and technology highlights
just info
```

---

## Features & Modules

### 1. Interactive Architecture Visualizer
- Visual exploration of the four pNFS-Lattice architectural planes:
  - **Linux Kernel Clients** (`nfs_layout_flexfiles`)
  - **Active-Active Lattice MDS Fleet** (`lattice-pnfs` C daemons)
  - **RonDB Metadata Catalogue Authority** (ACID in-memory store)
  - **Data Server Control & Storage Fleet** (Unmodified `knfsd` TCP/RDMA nodes)
- Clickable nodes revealing internal source files (`src/mds/compound_layout.c`, `catalogue_rondb_shim.cpp`, `ds_gc.c`), data structures, and memory profiles.

### 2. Protocol Lifecycle Simulator
- Step-by-step interactive visualizer tracing the five phases of a pNFS Flex Files request:
  1. Discovery & Referrals (`fs_locations` / `NFS4ERR_MOVED`)
  2. `OPEN` & Fused `LAYOUTGET`
  3. Direct Client ↔ Data Server Parallel I/O (MDS bypassed)
  4. `LAYOUTCOMMIT` & `LAYOUTRETURN`
  5. Asynchronous Stripe Garbage Collection (`gc_queue` -> `ds_gc.c`)

### 3. High-Concurrency AI & HPC Bottleneck Lab
- Compare **Traditional NFS**, **Traditional pNFS**, and **pNFS-Lattice** under simulated AI training storms (up to 10,000 GPU clients).
- Adjust clients, active MDS nodes, and data server striping in real time to observe throughput, IOPS, latency, and directory lock contention.

### 4. Comprehensive Study Syllabus
- In-depth technical breakdowns covering RFC 5661, RFC 7862, RFC 8435, RonDB's `interpretedUpdateTuple`, Wave-2 heap scratch memory, and the NetApp 2026 integration.

### 5. Flashcard Mastery Deck
- 10 spaced-repetition style flashcards with 3D flip animations covering protocols, concurrency, memory models, and deployment topologies.

### 6. Certification Exam Quiz
- 8 challenging multiple-choice questions with instant scoring, progress tracking, and deep architectural explanations.

### 7. Interactive Terminal Sandbox (Lattice CLI)
- Simulated terminal supporting commands like:
  - `mds-status`
  - `rondb-status`
  - `ds-pool`
  - `mds-find --size +1G` (demonstrating `NdbScanFilter` predicate pushdown)
  - `mds-admin hpc enable <path>` (demonstrating `MDS_IFLAG_HPC_SHARED` wide striping)
  - `cat-inspect inode <id>`

### 8. Searchable Glossary & RFC Reference
- Live-filtered definitions and RFC citations for all core storage concepts.

---

## Directory Structure

```
pnf-lattice-study-app/
├── justfile                     # Task runner configuration
├── server.py                    # Zero-dependency Python HTTP server & REST simulation API
├── cli.py                       # Rich terminal study tool & quiz runner
├── README.md                    # Project overview & instructions
├── docs/
│   └── PNFS_AND_LATTICE_GUIDE.md# Complete theoretical & architectural reference
├── tests/
│   └── test_study_app.py        # Automated test suite
└── static/
    ├── index.html               # Main studio dashboard
    ├── style.css                # Dark-mode modern styling
    └── app.js                   # Interactive client-side engine & state machine
```

---

## Requirements

- Python 3.8+ (Zero third-party pip dependencies required; uses standard library)
- `just` task runner (installed at `/usr/bin/just`)
- Any modern web browser
