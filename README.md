# Java Explorer

A lightweight and efficient Java project explorer for Visual Studio Code, designed to feel at home for developers coming from IntelliJ IDEA.

## Features

- **Custom Java Icons**: Automatically detects and displays specific icons for Java Classes, Interfaces, Abstract Classes, and Enums based on file content analysis.
- **Clean UI**: Automatically hides `.java` extensions in the tree view, similar to IntelliJ IDEA, providing a cleaner and more professional workspace.
- **Git Integration**: Access Git commands (Commit, Push, Pull, Stage, etc.) directly from the explorer's context menu.
- **Compact Folder View**: Automatically merges empty intermediate Java packages (e.g., `com.example.app`) into a single tree node for a cleaner workspace.
- **Select Opened File (Reveal)**: Quickly locate and highlight the currently active editor file in the Java Explorer tree with a single click on the "target" icon.
- **Auto Reveal**: Keep your path in the tree synchronized with your active editor tab automatically (can be toggled in settings).
- **Quick Java Creation**: Context menu shortcuts to create Java Classes, Interfaces, Enums, Annotations, and Spring-specific components (Controllers, Services, Repositories).
- **Standard File Operations**: Full support for Rename, Copy, Cut, Paste, and Delete within the explorer.
- **System Integration**: Open files/folders in the terminal or reveal them in your OS file explorer.

## Extension Settings

This extension contributes the following settings:

* `java-projects-explorer.autoReveal`: Automatically reveal the active file in the Java Explorer tree view (Default: `false`).

## Release Notes

### 1.0.6
- **Robust Undo Mechanics**: Full global tracking of `Cut`, `Copy`, `Paste`, `Delete`, and `Rename` operations, ensuring seamless, focus-agnostic `Ctrl+Z` (or `Cmd+Z`) actions.
- **Native macOS Shortcuts**: Fully mapped native system shortcuts alongside standard ones.

### 1.0.5
- **Clean UI**: Automatically hide `.java` extensions in the tree view.

### 1.0.4

- Small documentation updates and final adjustments.

### 1.0.3

- **Enhanced Java Icons**: Specific icons for classes, interfaces, abstract classes, and enums, determined by content analysis.
- **Git Integration**: Context menu support for common Git operations.

### 1.0.2

- Added automatic file system monitoring (FileSystemWatcher).
- Improved refresh logic and error handling.

### 1.0.1

- Fixed `EACCES: permission denied` errors.
- Added robust error handling for directory operations.

### 1.0.0

Initial release of Java Explorer with compact folder support, reveal functionality, and quick Java item creation.

---

**Enjoy a cleaner Java development experience!**
