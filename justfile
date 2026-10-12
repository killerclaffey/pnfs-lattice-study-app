# pNFS & pNFS-Lattice Study Companion Justfile
# Use `just` or `just <recipe>` to manage and run the study tools

# Default recipe: list available commands
default:
    @just --list

# Start the interactive web study studio (default port 8080)
run PORT="8080":
    python3 server.py --port {{PORT}}

# Start the server in development mode
dev PORT="8080":
    python3 server.py --port {{PORT}} --dev

# Launch the interactive terminal CLI study companion (Flashcards, Quiz, Topic Explorer)
cli:
    python3 cli.py

# Run test suite verifying data integrity and server REST endpoints
test:
    python3 -m unittest discover -s tests -p "test_*.py" -v

# Display architecture summary and technology quick-reference
info:
    @echo "=========================================================================="
    @echo "  pNFS & pNFS-LATTICE ARCHITECTURAL SUMMARY (2026)"
    @echo "=========================================================================="
    @echo "  • pNFS (RFC 5661, 7862): Separates Metadata (MDS) from Data (DS)."
    @echo "  • Flex Files (RFC 8435): Allows unpatched Linux knfsd as Data Servers."
    @echo "  • pNFS-Lattice: Active-Active user-space MDS fleet backed by RonDB."
    @echo "  • RonDB Engine: Single NDB transaction atomicity + interpretedUpdateTuple."
    @echo "  • Key Workloads: AI training (DataLoader storms), 100B+ LLM checkpointing."
    @echo "=========================================================================="
    @echo "  Quick start web studio:   just run"
    @echo "  Quick start CLI trainer:  just cli"
    @echo "=========================================================================="
