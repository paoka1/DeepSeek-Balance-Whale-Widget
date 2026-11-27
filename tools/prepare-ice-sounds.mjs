import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const [input, outputDir, ...extra] = process.argv.slice(2)
if (!input || !outputDir || extra.length) {
  console.error('用法：node tools/prepare-ice-sounds.mjs <约 1.06 秒的原版三连音> <输出目录>')
  process.exit(1)
}

const source = path.resolve(input)
const single = path.resolve(outputDir, 'ice-single.wav')
const triple = path.resolve(outputDir, 'ice-triple.wav')
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source], { encoding: 'utf8' })
const duration = Number(probe.stdout?.trim())
if (probe.status !== 0 || !Number.isFinite(duration) || Math.abs(duration - 1.06) > 0.02) {
  console.error(probe.error?.message || probe.stderr?.trim() || '需要约 1.06 秒的原版三连音，裁切时间以该版本为准。')
  process.exit(1)
}
if (existsSync(single) || existsSync(triple)) {
  console.error('输出目录中已有同名 WAV，请使用另一个目录。')
  process.exit(1)
}
mkdirSync(outputDir, { recursive: true })

const cleanup = 'highpass=f=90:p=2,equalizer=f=465:t=q:w=1.2:g=-2,lowpass=f=12500:p=2'
const attack = 'afade=t=in:st=0:d=0.0015:curve=hsin'
const level = 'volume=-4dB,aresample=osf=s16:dither_method=triangular'
// 单声保留第三下的起音，三连声保留全部三下和原始间隔。
const filters = [
  '[0:a:0]asplit=2[one][three]',
  '[one]atrim=start=0.337:end=0.762,asetpts=PTS-STARTPTS,' +
    cleanup + ',' + attack + ',afade=t=out:st=0.245:d=0.180:curve=qsin,' + level + '[single]',
  '[three]atrim=start=0.010:end=1.01,asetpts=PTS-STARTPTS,' +
    cleanup + ',' + attack + ',afade=t=out:st=0.82:d=0.18:curve=qsin,' + level + '[triple]',
].join(';')
const pcm = ['-map_metadata', '-1', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le']
const render = spawnSync('ffmpeg', [
  '-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-i', source, '-filter_complex', filters,
  '-map', '[single]', ...pcm, single,
  '-map', '[triple]', ...pcm, triple,
], { stdio: 'inherit' })
if (render.status !== 0) {
  if (render.error) console.error(render.error.message)
  process.exit(render.status ?? 1)
}
console.log('🧊 ' + single)
console.log('🧊🧊🧊 ' + triple)
