import path from 'path';

export interface LaunchPlan {
  command: string;
  args: string[];
  cwd: string;
}

export const planLaunch = (
  executable: string,
  modFolder: string | undefined,
  extra: readonly string[],
): LaunchPlan => ({
  command: executable,
  args: [...extra, ...(modFolder ? ['-mod', modFolder] : [])],
  cwd: path.dirname(executable),
});
