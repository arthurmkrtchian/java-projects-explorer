import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectProvider, ProjectItem } from './projectProvider';

let clipboardSourcePath: string | undefined;
let isCutOperation: boolean = false;

// Custom Undo Stack
interface UndoOperation {
    type: 'create' | 'rename' | 'delete' | 'copy' | 'cut';
    sourcePath?: string;
    destPath?: string;
    content?: Uint8Array;
}
let undoStack: UndoOperation[] = [];

async function buildCopyEdit(sourcePath: string, destPath: string, wsEdit: vscode.WorkspaceEdit) {
    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) {
        const items = fs.readdirSync(sourcePath);
        for (const item of items) {
            await buildCopyEdit(path.join(sourcePath, item), path.join(destPath, item), wsEdit);
        }
    } else {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(sourcePath));
        wsEdit.createFile(vscode.Uri.file(destPath), { contents: content, ignoreIfExists: true }, { label: "Copy File", needsConfirmation: false });
    }
}

export function activate(context: vscode.ExtensionContext) {
    const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";
    const projectProvider = new ProjectProvider(rootPath);

    // ЯВНОЕ СОЗДАНИЕ TREEVIEW ДЛЯ ПОДДЕРЖКИ ГОРЯЧИХ КЛАВИШ И DRAG-AND-DROP
    const treeView = vscode.window.createTreeView('javaProjectsExplorer', {
        treeDataProvider: projectProvider,
        showCollapseAll: true,
        canSelectMany: true,
        dragAndDropController: projectProvider
    });

    // Хелпер для получения узла (из клика или из выделения)
    const getActiveNode = (node: ProjectItem | undefined): ProjectItem => {
        if (node) { return node; }
        if (treeView.selection.length > 0) { return treeView.selection[0]; }
        // Fallback to workspace root
        return new ProjectItem(path.basename(rootPath), rootPath, vscode.TreeItemCollapsibleState.Expanded, true);
    };

    const createItem = async (node: ProjectItem, isFolder: boolean, type?: string, annotation?: string) => {
        const target = getActiveNode(node);

        const name = await vscode.window.showInputBox({
            prompt: `Enter ${type || (isFolder ? 'directory' : 'file')} name`,
            placeHolder: type ? `My${type}` : ""
        });
        if (!name) { return; }

        const folderPath = target.isDirectory ? target.fsPath : path.dirname(target.fsPath);
        const newPath = path.join(folderPath, type ? `${name}.java` : name);

        try {
            if (isFolder) {
                fs.mkdirSync(newPath, { recursive: true });
                projectProvider.refresh();
            } else {
                const uri = vscode.Uri.file(newPath);
                const wsEdit = new vscode.WorkspaceEdit();
                wsEdit.createFile(uri, { ignoreIfExists: true }, { label: "Create File", needsConfirmation: false });

                const pkgMatch = folderPath.match(/src[\/\\]main[\/\\]java[\/\\](.*)/);
                const pkg = pkgMatch ? pkgMatch[1].replace(/[\/\\]/g, '.') : '';
                let content = pkg ? `package ${pkg};\n\n` : '';
                if (annotation) { content += `${annotation}\n`; }
                const keyword = type === 'Interface' ? 'interface' : type === 'Enum' ? 'enum' : 'class';
                content += `public ${keyword} ${name} {\n\n}`;

                wsEdit.insert(uri, new vscode.Position(0, 0), content);
                await vscode.workspace.applyEdit(wsEdit);
                vscode.commands.executeCommand('vscode.open', uri);
                projectProvider.refresh();
            }
        } catch (err: any) { vscode.window.showErrorMessage(err.message); }
    };

    context.subscriptions.push(
        treeView,
        projectProvider,
        // UNDO COMMAND
        vscode.commands.registerCommand('java-projects-explorer.undo', async () => {
            const operation = undoStack.pop();
            if (!operation) {
                vscode.window.setStatusBarMessage("Nothing to undo", 2000);
                return;
            }

            try {
                const wsEdit = new vscode.WorkspaceEdit();
                if (operation.type === 'create' && operation.destPath) {
                    wsEdit.deleteFile(vscode.Uri.file(operation.destPath), { recursive: true, ignoreIfNotExists: true });
                } else if (operation.type === 'delete' && operation.destPath && operation.content) {
                    wsEdit.createFile(vscode.Uri.file(operation.destPath), { contents: operation.content, ignoreIfExists: false });
                } else if (operation.type === 'rename' && operation.sourcePath && operation.destPath) {
                    wsEdit.renameFile(vscode.Uri.file(operation.destPath), vscode.Uri.file(operation.sourcePath), { overwrite: true });
                } else if (operation.type === 'copy' && operation.destPath) {
                    wsEdit.deleteFile(vscode.Uri.file(operation.destPath), { recursive: true, ignoreIfNotExists: true });
                } else if (operation.type === 'cut' && operation.sourcePath && operation.destPath) {
                    // Revert by moving the file back
                    wsEdit.renameFile(vscode.Uri.file(operation.destPath), vscode.Uri.file(operation.sourcePath), { overwrite: true });
                }

                await vscode.workspace.applyEdit(wsEdit);
                vscode.window.setStatusBarMessage(`Undo: ${operation.type}`, 2000);
                setTimeout(() => projectProvider.refresh(), 100);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Undo failed: ${err.message}`);
            }
        }),
        // СОЗДАНИЕ (9 команд)
        vscode.commands.registerCommand('java-projects-explorer.createClass', n => createItem(n, false, 'Class')),
        vscode.commands.registerCommand('java-projects-explorer.createInterface', n => createItem(n, false, 'Interface')),
        vscode.commands.registerCommand('java-projects-explorer.createEnum', n => createItem(n, false, 'Enum')),
        vscode.commands.registerCommand('java-projects-explorer.createAnnotation', n => createItem(n, false, 'Annotation', '@interface')),
        vscode.commands.registerCommand('java-projects-explorer.createController', n => createItem(n, false, 'Controller', '@RestController')),
        vscode.commands.registerCommand('java-projects-explorer.createService', n => createItem(n, false, 'Service', '@Service')),
        vscode.commands.registerCommand('java-projects-explorer.createRepository', n => createItem(n, false, 'Repository', '@Repository')),
        vscode.commands.registerCommand('java-projects-explorer.createFile', n => createItem(n, false)),
        vscode.commands.registerCommand('java-projects-explorer.createFolder', n => createItem(n, true)),

        // ГОРЯЧИЕ КЛАВИШИ (Copy, Cut, Paste, Delete, Rename)
        // ГОРЯЧИЕ КЛАВИШИ (Copy, Cut, Paste, Delete, Rename)
        vscode.commands.registerCommand('java-projects-explorer.copy', async n => {
            const target = getActiveNode(n);
            if (target) {
                isCutOperation = false;
                await vscode.env.clipboard.writeText(target.fsPath);
                // Also write to special internal clipboard variable if we want to restrict paste logic,
                // but using system clipboard is better for interoperability.
                // However, the original code used a variable to track the "source to be pasted".
                // We'll keep the variable for "internal" paste context but ALSO write to system clipboard.
                clipboardSourcePath = target.fsPath;
                vscode.window.setStatusBarMessage(`Copied: ${path.basename(target.fsPath)}`, 2000);
            }
        }),
        vscode.commands.registerCommand('java-projects-explorer.cut', async n => {
            const target = getActiveNode(n);
            if (target) {
                isCutOperation = true;
                clipboardSourcePath = target.fsPath;
                await vscode.env.clipboard.writeText(target.fsPath);
                vscode.window.setStatusBarMessage(`Cut: ${path.basename(target.fsPath)}`, 2000);
            }
        }),
        vscode.commands.registerCommand('java-projects-explorer.paste', async n => {
            const target = getActiveNode(n);
            if (!target) { return; }

            const destDir = target.isDirectory ? target.fsPath : path.dirname(target.fsPath);

            // Try to get path from internal state first?
            // If we have internal state, we use it (supports cut state).
            // If not (e.g. copied from outside), we try system clipboard.

            let sourcePath = clipboardSourcePath;
            let performCut = isCutOperation;

            if (!sourcePath) {
                // Read from clipboard
                const text = await vscode.env.clipboard.readText();
                if (text && fs.existsSync(text)) {
                    sourcePath = text;
                    performCut = false; // Always copy from external source
                }
            }

            if (!sourcePath) { return; }

            const destPath = path.join(destDir, path.basename(sourcePath));
            try {
                const wsEdit = new vscode.WorkspaceEdit();
                if (performCut) {
                    await buildCopyEdit(sourcePath, destPath, wsEdit);
                    wsEdit.deleteFile(vscode.Uri.file(sourcePath), { recursive: true, ignoreIfNotExists: true }, { label: "Cut File", needsConfirmation: false });
                    clipboardSourcePath = undefined;
                    isCutOperation = false;
                    undoStack.push({ type: 'cut', sourcePath: sourcePath, destPath: destPath });
                } else {
                    await buildCopyEdit(sourcePath, destPath, wsEdit);
                    undoStack.push({ type: 'copy', destPath: destPath });
                }
                await vscode.workspace.applyEdit(wsEdit);
                projectProvider.refresh();
            } catch (e: any) { vscode.window.showErrorMessage(e.message); }
        }),
        vscode.commands.registerCommand('java-projects-explorer.rename', async n => {
            const target = getActiveNode(n);
            if (!target) { return; }
            const newName = await vscode.window.showInputBox({ value: path.basename(target.fsPath) });
            if (newName) {
                const wsEdit = new vscode.WorkspaceEdit();
                const destPath = path.join(path.dirname(target.fsPath), newName);
                wsEdit.renameFile(vscode.Uri.file(target.fsPath), vscode.Uri.file(destPath), { overwrite: false }, { label: "Rename File", needsConfirmation: false });
                await vscode.workspace.applyEdit(wsEdit);
                undoStack.push({ type: 'rename', sourcePath: target.fsPath, destPath: destPath });
                projectProvider.refresh();
            }
        }),
        vscode.commands.registerCommand('java-projects-explorer.deleteItem', async n => {
            const target = getActiveNode(n);
            if (!target) { return; }

            // Prevent deleting the root folder
            if (target.fsPath === rootPath) {
                vscode.window.showWarningMessage("Cannot delete the project root.");
                return;
            }

            const confirm = await vscode.window.showWarningMessage(`Delete ${target.label}?`, { modal: true }, 'Yes');
            if (confirm === 'Yes') {
                const content = !target.isDirectory ? await vscode.workspace.fs.readFile(vscode.Uri.file(target.fsPath)) : undefined;

                const wsEdit = new vscode.WorkspaceEdit();
                wsEdit.deleteFile(vscode.Uri.file(target.fsPath), { recursive: true, ignoreIfNotExists: true }, { label: "Delete", needsConfirmation: false });
                await vscode.workspace.applyEdit(wsEdit);

                undoStack.push({ type: 'delete', destPath: target.fsPath, content: content });
                projectProvider.refresh();
            }
        }),

        // УТИЛИТЫ
        vscode.commands.registerCommand('java-projects-explorer.copyAbsPath', n => vscode.env.clipboard.writeText(getActiveNode(n)?.fsPath || "")),
        vscode.commands.registerCommand('java-projects-explorer.copyRelPath', n => vscode.env.clipboard.writeText(path.relative(rootPath, getActiveNode(n)?.fsPath || ""))),
        vscode.commands.registerCommand('java-projects-explorer.openTerminal', n => vscode.window.createTerminal({ cwd: getActiveNode(n)?.fsPath }).show()),
        vscode.commands.registerCommand('java-projects-explorer.revealInOS', n => vscode.commands.executeCommand('revealFileInOS', getActiveNode(n)?.resourceUri)),

        vscode.commands.registerCommand('java-projects-explorer.revealCurrentFile', () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const fsPath = activeEditor.document.uri.fsPath;
                if (fsPath.startsWith(rootPath) && fs.existsSync(fsPath)) {
                    const isDirectory = fs.lstatSync(fsPath).isDirectory();
                    const item = new ProjectItem(path.basename(fsPath), fsPath, isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, isDirectory);
                    treeView.reveal(item, { select: true, focus: true, expand: true });
                }
            }
        })
    );

    // AUTO REVEAL
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && vscode.workspace.getConfiguration('java-projects-explorer').get('autoReveal')) {
                const fsPath = editor.document.uri.fsPath;
                if (fsPath.startsWith(rootPath) && fs.existsSync(fsPath)) {
                    const isDirectory = fs.lstatSync(fsPath).isDirectory();
                    const item = new ProjectItem(path.basename(fsPath), fsPath, isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, isDirectory);
                    treeView.reveal(item, { select: true, focus: false, expand: true });
                }
            }
        })
    );
}

export function deactivate() { }