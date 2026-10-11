#!/usr/bin/env node
// Inlines the app into two single files:
//   dist/goalmark.html  standalone page, served by server.mjs or opened directly
//   dist/artifact.html  the same app as a page fragment for claude.ai (review-only)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => readFileSync(join(here, 'src', f), 'utf8')
const script = (code) => '<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>'

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400&family=Source+Sans+3:wght@400;600;700&display=swap">'

function page(build) {
  return [
    '<title>Goalmark</title>',
    FONTS,
    '<style>\n' + read('styles.css') + '\n</style>',
    read('body.html'),
    script(`window.GOALMARK_BUILD = ${JSON.stringify(build)};`),
    script(read('engine.js')),
    script(read('scan.js')),
    script(read('app.js')),
  ].join('\n')
}

mkdirSync(join(here, 'dist'), { recursive: true })
const standalone = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="color-scheme" content="light dark">\n' +
  page('standalone').replace(read('body.html'), '</head>\n<body>\n' + read('body.html')) + '\n</body>\n</html>\n'
writeFileSync(join(here, 'dist', 'goalmark.html'), standalone)
writeFileSync(join(here, 'dist', 'artifact.html'), page('artifact') + '\n')
console.log('Built dist/goalmark.html and dist/artifact.html')
