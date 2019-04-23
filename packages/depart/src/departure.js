#!/usr/bin/env node
const { List } = require('immutable')
const assert = require('chai').assert
const utils = require('@democracy.js/utils')
utils.setFS(require('fs'))
utils.setPath(require('path')) 
const { BuildsManager, Linker, isLink, Deployer, isDeploy, isCompile, isContract }
  = require('@democracy.js/contract')
const { Compiler } = require('@democracy.js/compile')

const LOGGER = new utils.Logger('departure')

const departs = {}

departs.depart = async ({name, cleanAfter, address, sourcePath, callback}) => {
  assert(address, " `address` param needed to deploy from.")
  assert(callback, " `callback` param needed to run departure function.")

  LOGGER.info(`Now departing: ${name}`)

  let eth = utils.getNetwork()
  let accounts = await eth.accounts()
  let chainId = await eth.net_version()
  let bm = new BuildsManager({startSourcePath: sourcePath, chainId: chainId})
  let c = new Compiler({startSourcePath:sourcePath})
  let cm = c.getContractsManager()
  let l = new Linker({bm:bm})
  let d = new Deployer({bm:bm, chainId: chainId, eth: eth, address: address})

  let compiles = new Map()
  const compile = async ( contractName, sourceFile ) => {
    assert(sourceFile && sourceFile.endsWith('.sol'),
           'sourceFile param not given or does not end with .sol extension')
    const output = await c.compile( sourceFile )
    LOGGER.debug("COMPILE OUTPUT", output)
    assert(isCompile(output))
    assert.equal( output.get(contractName).get('name'), contractName )
    const contract = await cm.getContract(contractName)
    LOGGER.debug("COMPILE OUTPUT", contract)
    assert(isContract(contract))
    compiles = compiles.set(contractName, output)
  }

  let links = new Map()
  const link = async ( contractName, linkId, depMap ) => {
    assert(contractName, 'contractName param not given')
    assert(linkId, 'link name not given')
    let output = await bm.getLink( `${contractName}-${linkId}` )
    if (!link) {
      output = await l.link( contractName, linkId, depMap )
    }
    assert(isLink(output))
    links = links.set(contractName, output)
  }

  let deploys = new Map()
  const deploy = async ( contractName, linkId, deployId, ctorArgList, force ) => {
    assert(contractName, 'contractName param not given')
    assert(linkId, 'linkId param not given')
    assert(deployId, 'deployId param not given')
    const output = await d.deploy( contractName, linkId, deployId, ctorArgList, force )
    assert( isDeploy(output) )
    deploys = deploys.get(contractName, output)
  }

  const clean = async () => {
    compiles.forEach((c) => { cm.cleanContractSync(c.get('name')) })
    links.forEach(   (l) => { bm.cleanLinkSync(l.get('name')) })
    deploys.forEach( (d) => { bm.cleanDeploySync(d.get('name')) })
  }

  return callback(compile, link, deploy, c, l, d).then(() => {
    if (cleanAfter) { return clean() }
  })

}

module.exports = departs

if (require.main === module) {
  LOGGER.info(`Reading departure from ${process.argv[2]}`)
  const departure = require(process.argv[2])
  if (process.env['NODE_ENV'] !== 'MAINNET') {
    eval(departure)
    console.log("Departure complete.")
  }
}
