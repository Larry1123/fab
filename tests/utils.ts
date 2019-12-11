import * as execa from 'execa'

export const cmd = (command: string, ...opts: any) => {
  process.stdout.write(`$ ${command}\n`)
  return execa.command(command, ...opts)
}

export const shell = async (command: string, ...opts: any) => {
  const promise = cmd(command, ...opts)
  promise.stdout!.pipe(process.stdout)
  promise.stderr!.pipe(process.stderr)
  return promise
}

const SHOULD_HAVE_THROWN = `Shouldn't get here, expected to have already thrown`

export const expectError = async (command: string, ...opts: any) => {
  try {
    await (process.env.DEBUG ? shell : cmd)(command, ...opts)
    throw SHOULD_HAVE_THROWN
  } catch (error) {
    if (error === SHOULD_HAVE_THROWN) throw new Error(error)
    return error
  }
}