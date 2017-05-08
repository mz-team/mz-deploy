## 示例

```javascript
const deployTask= require('mz-deploy')

deployTask({
  urlMap: {
    'cn': {
      'meilan$1': /m(\d+)/, // url rewrite for different language
    }
  }
}).then((result) => {
  console.log(result) // return two array: result.success result.fail
}).catch(err => {
  console.log('ERROR: ' + err)
})
```

## 默认配置

```javascript
let config = {
  fileList: execSync('git log --pretty=format:"" --name-only  -1').toString().split('\n'),
  domain: process.env.npm_package_deploy_config_domain,
  forceClean: true,
  cdn: process.env.npm_package_deploy_config_cdn,
  receiver: process.env.npm_package_deploy_config_sqa_url,
  token: process.env.npm_package_deploy_config_sqa_token,
  email: process.env.MZ_FIS_EMAIL,
  urlMap: {}
}
```

## 错误码

* `TOKEN_INVALID` token 错误
* `FILE_CONFLICT` 文件在后台有更新引发冲突，需要先同步
* `REQUEST_ERROR` 网络出错
* `FILES_SHOULD_BE_COMMITTED_BEFORE_DEPLOY` 开启 `forceClean:true` 时需保证 git 已提交
* `FILE_LIST_IS_EMPTY` 上传的文件列表中没有符合上传规则的记录


## package.json 配置依赖

```json
  "deploy_config": {
    "sqa_url": "",
    "sqa_token": "",
    "prod_url": "",
    "domain": "",
    "cdn": ""
  },
```

