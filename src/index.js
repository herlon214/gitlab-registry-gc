const fs = require('fs')
const yaml = require('js-yaml')
const cheerio = require('cheerio')
const _request = require('request-promise-native')
const debug = require('debug')('grgc')
const { map, mapLimit } = require('awaity')
const { CronJob } = require('cron')

// Load yaml
const { CONFIG_FILE } = process.env
if (!CONFIG_FILE) throw new Error('CONFIG_FILE not set in env.')
const config = yaml.safeLoad(fs.readFileSync(CONFIG_FILE).toString())

if (!config.rootUrl) {
  config.rootUrl = 'https://gitlab.com'
}

const { rootUrl } = config

const request = _request.defaults({
  jar: true,
  simple: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36'
  }
})

const filterUrl = (url) => url.replace(rootUrl, '')

const endpoints = {
  signIn: `${rootUrl}/users/sign_in`
}

const loadTags = async (path) => {
  let result = []
  let i = 2
  let tags = await request.get(path, { json: true })

  // Get the image tags in the other pages
  while (tags.length > 0) {
    tags.map(item => result.push(item))
    tags = await request.get(path + `&page=${i}`, { json: true })
    i++
  }

  // Exclude tags specified
  result = result.filter(item => {
    return config.garbage.exclude.filter(name => name === item.name).length === 0
  })

  // Order the results
  result = result.sort((a, b) => {
    if (config.garbage.order === 'DESC') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    } else {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    }
  })

  return result
}

// Extract csrf from body
const getCSRF = (body) => {
  let $ = cheerio.load(body)
  const token = $('meta[name="csrf-token"]').attr('content')

  return token
}

async function checkForProject (project) {
  const name = filterUrl(project)
  const projectPage = await request.get(project + '/container_registry')
  const token = getCSRF(projectPage)

  const registryInfo = await request.get(project + '/container_registry.json', { json: true })
  const tags = await loadTags(rootUrl + registryInfo[0].tags_path)
  const willBeDeleted = []

  if (tags.length > config.garbage.max_entries) {
    debug(`Found ${tags.length} images for [${name}], ${tags.length - config.garbage.max_entries} higher than the limit`)
  } else {
    debug(`Found ${tags.length} images for [${name}]`)
  }

  // Insert the old images into the array to be deleted
  while (tags.length > config.garbage.max_entries) {
    willBeDeleted.push(tags.pop())
  }

  // Check if need to delete image tags
  if (willBeDeleted.length > 0) {
    debug(`Deleting old image tags...`)
    const deleted = await mapLimit(willBeDeleted, async (tag) => {
      const item = await request.delete(rootUrl + tag.destroy_path, {
        headers: {
          'X-CSRF-Token': token,
          'Referer': project + '/container_registry',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json;charset=utf-8',
          'Accept': 'application/json, text/plain, */*',
          'Origin': rootUrl
        }
      })

      if (item.length === 0) {
        debug(`[DELETED] ${tag.destroy_path}`)
      } else {
        console.log(item)
        debug(`[FAILED] ${tag.destroy_path}`)
      }

      return item
    }, config.garbage.max_parallel_delete)

    debug(`${deleted.length} image tags deleted for [${name}]`)
  }
}

async function main () {
  try {
    debug(`Getting token...`)
    const getSignIn = await request.get(endpoints.signIn)
    let token = getCSRF(getSignIn)
    const crons = []

    debug(`Authenticating as ${config.username}...`)
    const postSignIn = await request.post(endpoints.signIn).form({
      'utf8': '✓',
      'authenticity_token': token,
      'user[login]': config.username,
      'user[password]': config.password,
      'user[remember_me]': 1
    })

    if (postSignIn.indexOf('You are being') > 0) {
      debug(`Authenticated successfully!`)
    }

    debug(`Waiting for check period...`)
    await map(config.projects, async (project) => {
      const cron = new CronJob(config.garbage.check_period, () => checkForProject(project))
      cron.start()
      crons.push(cron)
    })
  } catch (err) {
    console.log(err)
  }
}

main()
