import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ProjectProvider implements vscode.TreeDataProvider<ProjectItem>, vscode.TreeDragAndDropController<ProjectItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProjectItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Drag and Drop MIME types
    // VS Code internally uses lowercase, but we'll support both to be safe given the View ID "javaDotsExplorer"
    readonly dropMimeTypes = [
        'application/vnd.code.tree.javaProjectsExplorer',
        'application/vnd.code.tree.javaprojectsexplorer',
        'text/uri-list'
    ];
    readonly dragMimeTypes = [
        'application/vnd.code.tree.javaProjectsExplorer',
        'application/vnd.code.tree.javaprojectsexplorer',
        'text/uri-list'
    ];

    constructor(private workspaceRoot: string) {
        console.log('[INIT] ProjectProvider created');
    }

    refresh(): void { this._onDidChangeTreeData.fire(); }
    getTreeItem(element: ProjectItem): vscode.TreeItem { return element; }

    getParent(element: ProjectItem): ProjectItem | undefined {
        if (!this.workspaceRoot || element.fsPath === this.workspaceRoot) {
            return undefined;
        }

        let p = path.dirname(element.fsPath);
        while (p.startsWith(this.workspaceRoot)) {
            if (p === this.workspaceRoot) {
                return new ProjectItem(path.basename(this.workspaceRoot), this.workspaceRoot, vscode.TreeItemCollapsibleState.Expanded, true, true);
            }

            try {
                const items = fs.readdirSync(p);
                const subDirs = items.filter(i => {
                    try { return fs.lstatSync(path.join(p, i)).isDirectory(); } catch { return false; }
                });
                const files = items.filter(i => {
                    try { return !fs.lstatSync(path.join(p, i)).isDirectory(); } catch { return false; }
                });

                if (subDirs.length !== 1 || files.length > 0) {
                    const compacted = this.getCompactedFolder(p);
                    return new ProjectItem(compacted.label, compacted.path, vscode.TreeItemCollapsibleState.Expanded, true);
                }
            } catch (e) {
                break;
            }

            p = path.dirname(p);
        }

        return undefined;
    }

    async getChildren(element?: ProjectItem): Promise<ProjectItem[]> {
        if (!this.workspaceRoot) { return []; }

        // If no element is passed, this is the root of the tree.
        // We return a single item representing the Workspace Root.
        if (!element) {
            const rootName = path.basename(this.workspaceRoot);
            return [new ProjectItem(
                rootName,
                this.workspaceRoot,
                vscode.TreeItemCollapsibleState.Expanded,
                true,
                true  // isRoot = true
            )];
        }

        // Otherwise, we are listing children of a specific folder (including the root folder we just returned)
        const currentPath = element.fsPath;
        if (!fs.existsSync(currentPath)) { return []; }

        const items = fs.readdirSync(currentPath);
        const result: ProjectItem[] = [];

        for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const stat = fs.lstatSync(fullPath);

            if (stat.isDirectory()) {
                const compacted = this.getCompactedFolder(fullPath);
                const hasContent = fs.readdirSync(compacted.path).length > 0;
                result.push(new ProjectItem(
                    compacted.label,
                    compacted.path,
                    hasContent ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    true
                ));
            } else {
                result.push(new ProjectItem(item, fullPath, vscode.TreeItemCollapsibleState.None, false));
            }
        }
        return result.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.label.localeCompare(b.label));
    }

    private getCompactedFolder(dirPath: string): { path: string; label: string } {
        const items = fs.readdirSync(dirPath);
        const subDirs = items.filter(i => fs.lstatSync(path.join(dirPath, i)).isDirectory());
        const files = items.filter(i => !fs.lstatSync(path.join(dirPath, i)).isDirectory());

        if (subDirs.length === 1 && files.length === 0) {
            const inner = this.getCompactedFolder(path.join(dirPath, subDirs[0]));
            return { path: inner.path, label: path.basename(dirPath) + "." + inner.label };
        }
        return { path: dirPath, label: path.basename(dirPath) };
    }

    public async handleDrag(source: readonly ProjectItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        console.log('[DRAG] handleDrag called with', source.length, 'items');

        // Set both specific MIME types to be safe
        const item = new vscode.DataTransferItem(source);
        dataTransfer.set('application/vnd.code.tree.javaProjectsExplorer', item);
        dataTransfer.set('application/vnd.code.tree.javaprojectsexplorer', item);

        if (token.isCancellationRequested) { return; }

        // Standard text/uri-list for external compatibility
        const uriList = source.map(item => item.resourceUri?.toString() || vscode.Uri.file(item.fsPath).toString()).join('\r\n');
        dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uriList));
    }

    public async handleDrop(target: ProjectItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        console.log('[DROP] handleDrop called');
        if (token.isCancellationRequested) { return; }

        // Try getting internal items (check both keys)
        const transferItem = dataTransfer.get('application/vnd.code.tree.javaProjectsExplorer')
            || dataTransfer.get('application/vnd.code.tree.javaprojectsexplorer');

        let sources: ProjectItem[] = [];

        if (transferItem) {
            sources = transferItem.value;
        }

        // Target directory resolution
        let targetPath = target ? target.fsPath : this.workspaceRoot;
        // If dropped onto a file, use its parent directory
        if (target && !target.isDirectory) {
            targetPath = path.dirname(target.fsPath);
        }

        // Processing internal objects
        if (sources.length > 0) {
            for (const source of sources) {
                const destPath = path.join(targetPath, path.basename(source.fsPath));
                this.moveFile(source.fsPath, destPath);
            }
        } else {
            // Processing external/text-uri-list
            const uriListItem = dataTransfer.get('text/uri-list');
            if (uriListItem) {
                const uriString = await uriListItem.asString();
                const uriLines = uriString.split(/\r?\n/).filter(line => line.trim() !== '');
                for (const line of uriLines) {
                    try {
                        const uri = vscode.Uri.parse(line);
                        // We only support file scheme for now
                        if (uri.scheme === 'file') {
                            const sourcePath = uri.fsPath;
                            const destPath = path.join(targetPath, path.basename(sourcePath));
                            this.moveFile(sourcePath, destPath);
                        }
                    } catch (e) {
                        console.error('Error parsing URI:', line, e);
                    }
                }
            }
        }

        this.refresh();
    }

    private moveFile(sourcePath: string, destPath: string) {
        if (sourcePath === destPath) { return; }
        try {
            // Prevent overwriting
            if (fs.existsSync(destPath)) {
                vscode.window.showErrorMessage(`File already exists: ${path.basename(destPath)}`);
                return;
            }
            fs.renameSync(sourcePath, destPath);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to move ${path.basename(sourcePath)}: ${e.message}`);
        }
    }
}


export class ProjectItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fsPath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isDirectory: boolean,
        public readonly isRoot: boolean = false
    ) {
        super(label, collapsibleState);
        this.id = fsPath;
        this.resourceUri = vscode.Uri.file(fsPath);
        if (this.isDirectory) {
            this.contextValue = this.isRoot ? 'rootFolder' : 'folder';
            if (this.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                this.iconPath = vscode.ThemeIcon.Folder;
            }
        } else {
            this.contextValue = 'file';
            this.command = {
                command: 'vscode.open',
                title: "Open",
                arguments: [this.resourceUri, { preserveFocus: true, preview: true }]
            };
        }
    }
}