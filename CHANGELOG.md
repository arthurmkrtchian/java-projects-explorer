# Change Log

All notable changes to the "java-projects-explorer" extension will be documented in this file.


Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.2] - 2026-02-19

- Added automatic file system monitoring (FileSystemWatcher) to keep the Java Projects Explorer tree view in sync with external changes.
- Improved tree view refresh logic for better responsiveness.
- Cleaned up debug logging and improved internal error handling.

## [1.0.1] - 2026-02-17

- Fixed `EACCES: permission denied` error when scanning directories with restricted permissions.
- Added robust error handling for directory operations in Project Explorer.

## [1.0.0] - 2026-02-17

- Initial release