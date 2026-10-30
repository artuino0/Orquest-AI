import { execFile } from 'node:child_process'
import { delimiter } from 'node:path'

/** Marcas alrededor del PATH: lo que imprima la configuración del usuario al arrancar no se confunde con él. */
const START = '__ORQUEST_PATH__'
const END = '__ORQUEST_FIN__'

/** El PATH que dejó el shell entre las marcas; undefined si no salió. */
export function pathFromOutput(out: string): string | undefined {
  const m = new RegExp(`${START}(.*)${END}`).exec(out)
  return m?.[1]?.trim() || undefined
}

/** Une dos PATH sin repetir carpetas: primero el del shell (su orden es el que el usuario eligió), luego lo que solo traía la app. */
export function mergePath(shell: string, current: string): string {
  return [...new Set([...shell.split(delimiter), ...current.split(delimiter)].filter(Boolean))].join(delimiter)
}

/**
 * El PATH del shell del usuario, como lo ve en su terminal. Una app abierta
 * desde el escritorio (Linux) o el Finder (macOS) no lo hereda: nvm,
 * `~/.local/bin` y similares se agregan en `.zshrc` o `.bashrc`, y sin ellos
 * no se encuentra ninguna CLI. Se le pide a un shell interactivo y de login
 * para que lea esos archivos; si tarda o falla, undefined.
 */
export function loginShellPath(shell = process.env.SHELL || '/bin/sh', timeoutMs = 5000): Promise<string | undefined> {
  return new Promise((done) => {
    execFile(
      shell,
      ['-ilc', `printf '%s' "${START}\${PATH}${END}"`],
      // Sin terminal: que oh-my-zsh y compañía no se pongan a actualizarse ni a preguntar.
      { timeout: timeoutMs, env: { ...process.env, DISABLE_AUTO_UPDATE: 'true', ZSH_DISABLE_COMPFIX: 'true' } },
      (_err, stdout) => done(pathFromOutput(String(stdout ?? ''))),
    )
  })
}

/** Suma al PATH de este proceso el del shell del usuario. En Windows no hace falta: las apps heredan el PATH del sistema. */
export async function adoptShellPath(platform: NodeJS.Platform = process.platform, read = loginShellPath): Promise<void> {
  if (platform === 'win32') return
  const shell = await read()
  if (shell) process.env.PATH = mergePath(shell, process.env.PATH ?? '')
}
