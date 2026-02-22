# Change Log

All notable changes to the "java-projects-explorer" extension will be documented in this file.


Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.6] - 2026-02-22

- **Robust Undo System**: Implemented a standalone custom undo tracker ensuring completely reliable revert operations for Create, Rename, Delete, Cut, and Copy actions regardless of editor focus.
- Introduced native OS shortcuts logic (e.g. `Cmd+Z`, `Cmd+C`, `Cmd+Backspace`) for macOS.
- Removed legacy test unit files.

## [1.0.5] - 2026-02-22

- Cleaner UI: Automatically hide `.java` extensions in the tree view for a more professional look.

## [1.0.4] - 2026-02-22

- Final documentation refinements and verification of Java icon logic.

## [1.0.3] - 2026-02-22

- Added specific icons for Java Packages, Classes, Interfaces, Abstract Classes, and Enums.
- Implemented robust Java file type detection based on content analysis (stripping comments and strings).
- Integrated Git commands into the tree view context menu.

## [1.0.2] - 2026-02-19

- Added automatic file system monitoring (FileSystemWatcher) to keep the Java Projects Explorer tree view in sync with external changes.
- Improved tree view refresh logic for better responsiveness.
- Cleaned up debug logging and improved internal error handling.

## [1.0.1] - 2026-02-17

- Fixed `EACCES: permission denied` error when scanning directories with restricted permissions.
- Added robust error handling for directory operations in Project Explorer.

## [1.0.0] - 2026-02-17

- Initial release