/**
 * ORCA Windows Servislerini kaldırır (OrcaApi, OrcaTrigger).
 * Yönetici olarak çalıştırın: node scripts/uninstall-windows-services.cjs
 */

const path = require('path')
const { Service } = require('node-windows')

const appRoot = path.resolve(__dirname, '..')
const scriptApi = path.join(appRoot, 'scripts', 'db-server.cjs')
const scriptTrigger = path.join(appRoot, 'scripts', 'orca-trigger-service.cjs')

function uninstallService(name, scriptPath) {
  return new Promise((resolve, reject) => {
    const svc = new Service({ name, script: scriptPath, workingDirectory: appRoot })
    svc.on('uninstall', () => {
      console.log(`[OK] ${name} kaldırıldı.`)
      resolve()
    })
    svc.on('alreadyuninstalled', () => {
      console.log(`[INFO] ${name} zaten kaldırılmış.`)
      resolve()
    })
    svc.on('error', err => {
      console.error(`[HATA] ${name}:`, err.message)
      reject(err)
    })
    svc.uninstall()
  })
}

async function main() {
  console.log('ORCA Windows Servisleri kaldırılıyor...')
  try {
    await uninstallService('OrcaTrigger', scriptTrigger)
    await uninstallService('OrcaApi', scriptApi)
    console.log('Tamamlandı.')
  } catch (err) {
    console.error('Hata:', err.message)
    process.exit(1)
  }
}

main()
