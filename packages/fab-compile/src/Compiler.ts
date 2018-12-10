import * as fs from 'fs-extra'
import chalk from 'chalk'
import * as util from 'util'
import * as globby from 'globby'
import * as path from 'path'
// @ts-ignore
import * as _zip from 'deterministic-zip'
import * as webpack from 'webpack'
import * as hasha from 'hasha'
const zip = util.promisify(_zip)

const _log = (str: string) =>
  `${chalk.gray(`[FAB:Compile]`)} ${str
    .split(/\n\s*/)
    .join('\n              ')}`
const log = (str: string) => console.log(_log(str))
const error = (str: string) => console.log(_log(chalk.red(str)))

export default class Compiler {
  static async compile(input_dir: string, build_dir: string, output_file: string) {
    const input_path = path.resolve(input_dir)
    const build_path = path.resolve(build_dir)

    if (!(await fs.pathExists(input_path))) {
      error(`${input_path} doesn't exist!`)
      throw new Error('Missing directory')
    }
    log(`Compiling ${chalk.green(input_path)}`)

    const assets_path = path.join(input_path, '_assets')
    if (!(await fs.pathExists(assets_path))) {
      log(`${chalk.yellow(`No _assets directory detected.`)}
        This isn't necessarily a problem, but your FAB may be able to be optimised.
        For more info, visit https://fab-spec.org/eh?no-assets-dir`)
    }

    const server_path = path.join(input_path, '_server')
    if (!(await fs.pathExists(server_path))) {
      log(`${chalk.yellow(`No _server directory detected.`)}
        Your FAB will only have the simplest of webservers injected.
        If you want to host a static site, you probably want @fab/static
        https://fab-spec.org/eh?no-server-dir`)
    }

    await fs.emptyDir(build_path)
    const paths = await globby(['**/*', '!_server', '!_assets'], {
      cwd: input_path
    })

    log(`Copying non-fingerprinted (public) assets:`)
    const renames: { [filename: string]: string } = {}
    await Promise.all(
      paths.map(async filename => {
        const full_hash = await hasha.fromFile(
          path.join(input_path, filename),
          {
            algorithm: 'md5'
          }
        )
        const hash = full_hash!.substring(0, 9)
        const asset_path = `_assets/_public/${filename.replace(
          /([^.]*)$/,
          `${hash}.$1`
        )}`
        renames['/' + filename] = '/' + asset_path
        log(
          `${input_dir}/${chalk.yellow(
            filename
          )} => ${build_dir}/${chalk.yellow(asset_path)}`
        )
        await fs.copy(
          path.join(input_path, filename),
          path.join(build_path, asset_path)
        )
      })
    )

    log(`Done!`)
    log(`Injecting FAB wrapper and compiling ${chalk.green(server_path)}`)
    await new Promise((resolve, reject) =>
      webpack(
        {
          mode: 'production',
          target: 'webworker',
          entry: path.resolve(__dirname, 'files/fab-wrapper.js'),
          optimization: {
            minimize: false
          },
          resolve: {
            alias: {
              fs: 'memfs',
              'app-index': path.resolve(server_path, 'index.js')
            }
          },
          output: {
            path: build_path,
            filename: 'server.js',
            library: 'server',
            libraryTarget: 'commonjs2'
          },
          node: {
            path: true,
            process: true,
            net: 'empty'
          },
          plugins: [
            new webpack.DefinePlugin({
              FAB_REWRITES: JSON.stringify(renames)
            })
          ]
        },
        (err, stats) => {
          if (err || stats.hasErrors()) {
            console.log('Build failed.')
            console.log(err)
            console.log(stats.toJson().errors.toString())
            reject()
          }
          resolve()
        }
      )
    )

    log(`Done!`)
    log(`Zipping it up into a FAB`)

    const zipfile = path.resolve(output_file)
    const options = {
      includes: ['./server.js', './_assets/**'],
      cwd: build_dir
    }
    await zip(build_dir, zipfile, options)

    log(chalk.green(`All done!`))
  }
}
