# Bookkeeping

A multi-language knowledge management system designed for structured data storage, quick access, and reliable backup of critical information across scientific and technical domains.

## Overview

Bookkeeping is a file-system-controlled and database-controlled system built to store, organize, and retrieve knowledge data efficiently. It serves as a comprehensive solution for managing information in mathematics, physics, chemistry, biochemistry, biology, and computer science (including hardware design, software development, and firmware).

**Key Features:**
- Multi-format data storage (CSV files for small-scale, databases for large-scale)
- Cross-platform compatibility with multiple programming language implementations
- Performance-optimized for critical knowledge access scenarios
- Template and reference guide management
- Knowledge visualization capabilities

## Architecture

### Data Storage Strategy
- **Small-scale data**: Multiple CSV files for simplicity and portability, directory from root ending in `grid`. Applications offer a CSV editor with extensive features, such as multicell support, auto-justify row height. However, these applications do not take consideration to the stored knowledge content.
- **Large-scale data**: Database solutions for performance and scalability, ending in `Bookkeeping`. Applications offer a standalone self-built database editor system for compact binary storage of knowledge data and quicker processing, taken consideration of the data content, layout and structure. 
- **Hybrid approach**: Seamless transition between storage methods based on data volume. CSV files can be used as transitioning storage phase to large-scale optimized database storage.

### Multi-Language Implementation

Each implementation provides the complete feature set with language-specific optimizations:

| Language | Focus | Status | Directory |
|----------|-------|--------|-----------|
| **Rust** | Performance & Memory Safety | In Development | `rust_grid/` (Rust CSV editor), `RustBookkeeping/` (Rust bookkeeping database) |
| **Java** | Enterprise & Cross-platform | In Development | `BookkeepingJava/` (Java bookkeeping database) |
| **Python** | Rapid Development & Data Science | In Development | `PyBookkeeping/` (Python bookkeeping database) |
| **C/C++** | System-level Performance | Planned | - |
| **JavaScript (TypeScript)** | Web Application | Planned | - |

## Current Implementation Status

⚠️ **Project Status**: Early development phase with scattered prototypes

### Java Implementation (`BookkeepingJava/`)
- CLI application framework
- Element registry system
- Table abstractions (ordered/unordered)
- Graph visualization components
- Command interface for updates and viewing

### Python Implementation (`PyBookkeeping/`)
- B-tree data structures for indexing
- Text-based user interface (TUI)
- JSON data handling
- Multiple version iterations (v1.0.0 - v2.0.1)

### Rust Implementation (`rust_grid/`, `RustBookkeeping/`)
- CSV processing capabilities
- AVL tree implementations
- History tracking tools
- Performance-focused data structures

## Use Cases

- **Academic Research**: Store and organize scientific formulas, theorems, and references
- **Technical Documentation**: Maintain hardware specifications and software documentation
- **Quick Reference**: Fast access to critical information in time-sensitive situations
- **Knowledge Backup**: Reliable data preservation and recovery
- **Template Management**: Standardized formats for consistent data entry

## Getting Started

### Prerequisites
- Choose your preferred implementation language
- Ensure appropriate runtime/compiler is installed

### Quick Start

#### Rust Version
```bash
cd rust_grid
cargo run
```

#### Java Version
```bash
cd BookkeepingJava
javac Main/Main.java
java Main.Main
```

#### Python Version
```bash
cd PyBookkeeping
python PyBookkeeping.py
```

## Project Structure

```
Bookkeeping/
├── BookkeepingJava/     # Java implementation
├── PyBookkeeping/       # Python implementation
├── rust_grid/           # Rust CSV processing
├── RustBookkeeping/     # Rust core implementation
└── Testprototypes/      # Development prototypes
```

## Development Philosophy

- **Performance vs Safety**: Balance between execution speed (C/C++/Rust) and development safety (Java/Python)
- **Deployment Flexibility**: Multiple language options for different system requirements
- **Scalability**: Adaptive storage solutions from CSV to database
- **Simplicity**: Easy deployment and specialized usage across different environments

## Contributing

This project is in active development. Each language implementation aims to provide the complete feature set while leveraging language-specific strengths.

## Future Roadmap

- [ ] Complete C/C++ implementations
- [ ] Web-based JavaScript version
- [ ] Database integration for all implementations
- [ ] Unified API across all language versions
- [ ] Advanced visualization features
- [ ] Cross-implementation data compatibility

## License

[License information to be added]

---

*Note: This project is currently under development with various prototypes and implementations in different stages of completion.*
