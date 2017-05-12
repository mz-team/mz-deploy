const fs = require('fs')
const path = require('path')
const execSync = require('child_process').execSync
const crypto = require('crypto')
const request = require('request')
const colors = require('colors')
const dateFormat = require('dateformat')
const co = require('co');

const getFileMeta = (function () {
  const langFilepath = path.join(process.cwd(), 'source/config/lang/')
  const langFilelist = fs.existsSync(langFilepath) && fs.readdirSync(langFilepath) || []
  const langMap = langFilelist.reduce((map, cur) => (map[cur.split('.')[0]] = cur.split('.')[1]) && map, {})
  return function (filepath) {
    const distPath = filepath.replace(/^source/, '')
    const absPath = path.join(process.cwd(), filepath)
    let namespace = ''
    let lang = ''
    let rewriteURL = ''
    let isStatic = false

    filepathArr = distPath.replace(/^\//, '').split('/')
    switch (filepathArr[0]) {
      case 'static':
        isStatic = true
      case 'template':
      case 'test':
        namespace = filepathArr[1]
        lang = langMap[namespace]
        break
      default:
        break
    }
    const pagePath = `/template/${namespace}/page`

    if (distPath.includes(pagePath)) {
      const pathObj = path.parse(distPath)
      const urlMap = config.urlMap[namespace]
      for (let urlPattern in urlMap) {
        if (urlMap[urlPattern].test(distPath)) {
          rewriteURL = distPath.replace(urlMap[urlPattern], (result, $1) => {
            return urlPattern.replace('$1', $1)
          }).replace(pagePath, '').replace('.tpl', '.html')
          break
        }
      }
    }

    return {
      namespace,
      distPath,
      absPath,
      rewriteURL,
      isStatic,
      lang
    }
  }
})()

const md5 = (str) => {
  return crypto.createHash('md5').update(crypto.createHash('md5').update(str).digest('hex')).digest('hex')
}

const upload = function (filepath) {
  return new Promise((resolve, reject) => {
    const fileMeta = getFileMeta(filepath)
    const now = new Date() - 0
    const formData = {
      force: 1,
      lang: fileMeta.lang,
      email: config.email,
      t: now,
      token: md5(now + config.token),
      domain: config.domain,
      to: fileMeta.distPath,
      file: {
        value: fs.createReadStream(fileMeta.absPath),
        options: {
          filename: fileMeta.distPath
        }
      }
    }

    if (fileMeta.rewriteURL) {
      formData.url = fileMeta.rewriteURL
    }
    if (fileMeta.isStatic) {
      formData.domain = config.cdn
    }

    const req = request.post({ url: config.receiver, formData: formData }, function (err, resp, body) {
      let time = dateFormat(now, '[HH:MM:ss]')
      let errormsg = ''
      if (body === '0') {
      } else if (body === '验证失败') {
        errormsg = 'TOKEN_INVALID'
        reject(errormsg)
      } else if (typeof body === 'string') {
        if (body.includes('conflict')) {
          errormsg = 'FILE_CONFLICT'
        } else {
          errormsg = 'UNEXPECTED_RESPONSE'
          reject(errormsg)
        }
      } else {
        errormsg = err.errno
        reject(errormsg)
      }

      let msg = `${time.gray} ${fileMeta.distPath} `
      if (errormsg) {
        msg += `✗ [${errormsg}]`.red
      } else {
        msg += '✔︎'.green
      }
      console.log(msg)

      resolve({
        error: errormsg,
        data: fileMeta.isStatic ? 'http://' + config.cdn + fileMeta.distPath : fileMeta.distPath
      })
    })
  })
}

const env = process.argv[2] || 'sqa'

let config = {
  fileList: execSync('git show --name-only --pretty="" -1').toString().split('\n'),
  domain: process.env.npm_package_deploy_config_domain,
  forceClean: true,
  cdn: process.env.npm_package_deploy_config_cdn,
  receiver: process.env[`npm_package_deploy_config_${env}_url`],
  token: process.env[`npm_package_deploy_config_${env}_token`] || process.env.MZ_FIS_MANAGE_SECRET,
  email: process.env.MZ_FIS_EMAIL,
  urlMap: {}
}

module.exports = function (c) {
  config = Object.assign(config, c)
  config.fileList = config.fileList
    .filter(filepath => /^source/.test(filepath))

  return co(function* () {
    if (config.forceClean && execSync('git status -s | wc -l').toString().trim() !== '0') {
      throw 'FILES_SHOULD_BE_COMMITTED_BEFORE_DEPLOY'
    }
    if (!config.fileList.length) {
      throw 'FILE_LIST_IS_EMPTY'
    }
    let success = []
    let fail = []
    
    for (let i = 0; i < config.fileList.length; i++) {
      let filepath = config.fileList[i]
      let ret = yield upload(filepath)
      ret.error ? fail.push(ret.data) : success.push(ret.data)
    }
    return { success, fail }
  })
}
