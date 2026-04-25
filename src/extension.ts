// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the CTL project.

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const factory = new CtlDebugAdapterFactory();
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory('ctl', factory)
    );
}

export function deactivate() { /* nothing to do */ }

class CtlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        _executable: vscode.DebugAdapterExecutable | undefined,
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        const ctldap = (session.configuration.ctldap as string) || 'ctldap';
        return new vscode.DebugAdapterExecutable(ctldap);
    }
}
