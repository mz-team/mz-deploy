const fs = require('fs')
const path = require('path')
const execSync = require('child_process').execSync
const crypto = require('crypto')
const request = require('request')
const colors = require('colors')
const dateFormat = require('dateformat')

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
    lang}
  }
})()

const upload = function (filepath, callback, isFirstRequest) {
  const fileMeta = getFileMeta(filepath)
  const now = new Date() - 0
  const formData = {
    force: 1,
    lang: fileMeta.lang,
    email: config.email,
    t: now,
    token: crypto.createHash('md5').update(now + config.token).digest('hex'),
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

  const req = request.post({url: config.receiver, formData: formData}, function (err, resp, body) {
    let time = dateFormat(now, '[HH:MM:ss]')
    let errormsg = ''
    if (body === '0') {
    }else if (body === '验证失败') {
      errormsg = 'TOKEN_INVALID'
    }else if (body.includes('conflict')) {
      errormsg = 'FILE_CONFLICT'
    }else {
      errormsg = 'REQUEST_ERROR'
    }
    if(!isFirstRequest){
      let msg = `${time.gray} ${fileMeta.distPath} `
      if(errormsg){
        msg += `✗ [${errormsg}]`.red
      }else{
        msg += '✔︎'.green
      }
      console.log(msg)
    }
    callback(errormsg, fileMeta.isStatic ? 'http://' + config.cdn + fileMeta.distPath : fileMeta.distPath)
  })
}

const env = process.argv[2] || 'sqa'

let config = {
  fileList: execSync('git log --pretty=format:"" --name-only  -1').toString().split('\n'),
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

  return new Promise((resolve, reject) => {
    let fileList = config.fileList.slice(0, 10)
      .filter(filepath => /^source/.test(filepath))
    let completeNum = 0
    let success = []
    let fail = []

    if(config.forceClean &&  execSync('git status -s | wc -l').toString().trim()){
      reject('FILES_SHOULD_BE_COMMITTED_BEFORE_DEPLOY')
      return false;
    }

    if(!fileList.length){
      reject('FILE_LIST_IS_EMPTY')
      return false;
    }

    upload(fileList[0], (err) => {
      if (err === 'TOKEN_INVALID') {
        reject(err)
      }else {
        fileList.map((filepath) => {
          upload(filepath, (err, distpath) => {
            err ? fail.push(distpath) : success.push(distpath)
            completeNum++
            if (completeNum === fileList.length) {
              resolve({success, fail})
            }
          })
        })
      }
    }, true)
  })
}
