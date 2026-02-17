import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectProvider, ProjectItem } from './projectProvider';

let clipboardSourcePath: string | undefined;
let isCutOperation: boolean = false;

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
            } else {
                const pkgMatch = folderPath.match(/src[\/\\]main[\/\\]java[\/\\](.*)/);
                const pkg = pkgMatch ? pkgMatch[1].replace(/[\/\\]/g, '.') : '';
                let content = pkg ? `package ${pkg};\n\n` : '';
                if (annotation) { content += `${annotation}\n`; }
                const keyword = type === 'Interface' ? 'interface' : type === 'Enum' ? 'enum' : 'class';
                content += `public ${keyword} ${name} {\n\n}`;
                fs.writeFileSync(newPath, content);
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(newPath));
            }
            projectProvider.refresh();
        } catch (err: any) { vscode.window.showErrorMessage(err.message); }
    };

    context.subscriptions.push(
        treeView,
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
                if (performCut) {
                    fs.renameSync(sourcePath, destPath);
                    clipboardSourcePath = undefined;
                    isCutOperation = false;
                } else {
                    fs.cpSync(sourcePath, destPath, { recursive: true });
                }
                projectProvider.refresh();
            } catch (e: any) { vscode.window.showErrorMessage(e.message); }
        }),
        vscode.commands.registerCommand('java-projects-explorer.rename', async n => {
            const target = getActiveNode(n);
            if (!target) { return; }
            const newName = await vscode.window.showInputBox({ value: path.basename(target.fsPath) });
            if (newName) {
                fs.renameSync(target.fsPath, path.join(path.dirname(target.fsPath), newName));
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
                fs.rmSync(target.fsPath, { recursive: true, force: true });
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