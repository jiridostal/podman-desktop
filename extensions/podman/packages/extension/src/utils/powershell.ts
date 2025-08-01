/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/
import * as extensionApi from '@podman-desktop/api';

export async function getPowerShellClient(telemetryLogger: extensionApi.TelemetryLogger): Promise<PowerShellClient> {
  return new PowerShell5Client(telemetryLogger);
}

export interface PowerShellClient {
  isVirtualMachineAvailable(): Promise<boolean>;
  isUserAdmin(): Promise<boolean>;
  isHyperVInstalled(): Promise<boolean>;
  isHyperVRunning(): Promise<boolean>;
  isRunningElevated(): Promise<boolean>;
}

const PowerShell5Exe = 'powershell.exe';
class PowerShell5Client implements PowerShellClient {
  constructor(private telemetryLogger: extensionApi.TelemetryLogger) {}

  async isVirtualMachineAvailable(): Promise<boolean> {
    const telemetry: Record<string, unknown> = {};
    try {
      // set CurrentUICulture to force output in english
      const res = await extensionApi.process.exec(
        PowerShell5Exe,
        [
          '[System.Console]::OutputEncoding = [System.Text.Encoding]::Unicode; (Get-WmiObject -Query "Select * from Win32_OptionalFeature where InstallState = \'1\'").Name | select-string VirtualMachinePlatform',
        ],
        { encoding: 'utf16le' },
      );
      telemetry['command'] = res.command;
      telemetry['stdout'] = res.stdout;
      telemetry['stderr'] = res.stderr;
      if (res.stdout.indexOf('VirtualMachinePlatform') >= 0) {
        return true;
      }
    } catch (err) {
      // ignore error, this means that VirtualMachinePlatform not enabled
      telemetry['error'] = err;
      const execError = err as extensionApi.RunError;
      telemetry['message'] = execError.message;
      telemetry['exitCode'] = execError.exitCode;
      telemetry['command'] = execError.command;
      telemetry['stdout'] = execError.stdout;
      telemetry['stderr'] = execError.stderr;
      telemetry['cancelled'] = execError.cancelled;
      telemetry['killed'] = execError.killed;
    }
    this.telemetryLogger.logUsage('check.isVirtualMachineAvailable', telemetry);
    return false;
  }

  async isUserAdmin(): Promise<boolean> {
    try {
      const { stdout: res } = await extensionApi.process.exec(PowerShell5Exe, [
        '$null -ne (whoami /groups /fo csv | ConvertFrom-Csv | Where-Object {$_.SID -eq "S-1-5-32-544"})',
      ]);
      return res.trim() === 'True';
    } catch (err: unknown) {
      return false;
    }
  }

  async isHyperVInstalled(): Promise<boolean> {
    try {
      await extensionApi.process.exec(PowerShell5Exe, ['Get-Service vmms']);
      return true;
    } catch (err: unknown) {
      return false;
    }
  }

  async isHyperVRunning(): Promise<boolean> {
    try {
      const result = await extensionApi.process.exec(PowerShell5Exe, ['@(Get-Service vmms).Status']);
      return result.stdout === 'Running';
    } catch (err: unknown) {
      return false;
    }
  }

  async isRunningElevated(): Promise<boolean> {
    try {
      const { stdout: res } = await extensionApi.process.exec(PowerShell5Exe, [
        '(New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
      ]);
      return res.trim() === 'True';
    } catch (err: unknown) {
      return false;
    }
  }
}
