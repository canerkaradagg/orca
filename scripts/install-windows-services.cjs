/**
 * ORCA Windows Servislerini kurar (OrcaApi + OrcaTrigger).
 * Yönetici olarak çalıştırın: node scripts/install-windows-services.cjs
 * Servis adları: OrcaApi, OrcaTrigger
 */

const path = require('path')
const { Service } = require('node-windows')

const appRoot = path.resolve(__dirname, '..')
const scriptApi = path.join(appRoot, 'scripts', 'db-server.cjs')
const scriptTrigger = path.join(appRoot, 'scripts', 'orca-trigger-service.cjs')

function installService(name, description, scriptPath) {
  return new Promise((resolve, reject) => {
    const svc = new Service({
      name,
      description,
      script: scriptPath,
      workingDirectory: appRoot,
    })
    svc.on('install', () => {
      console.log(`[OK] ${name} kuruldu. Başlatılıyor...`)
      svc.start()
    })
    svc.on('start', () => {
      console.log(`[OK] ${name} çalışıyor.`)
      resolve()
    })
    svc.on('alreadyinstalled', () => {
      console.log(`[INFO] ${name} zaten kurulu.`)
      resolve()
    })
    svc.on('error', err => {
      console.error(`[HATA] ${name}:`, err.message)
      reject(err)
    })
    svc.install()
  })
}

async function main() {
  console.log('ORCA Windows Servisleri kuruluyor...')
  console.log('  App root:', appRoot)
  console.log('  OrcaApi script:', scriptApi)
  console.log('  OrcaTrigger script:', scriptTrigger)
  console.log('')

  try {
    await installService(
      'OrcaApi',
      'ORCA ASN Portal API (port 3001)',
      scriptApi
    )
    await installService(
      'OrcaTrigger',
      'ORCA Tetikleyici (kuyruk, bakım, draft temizlik)',
      scriptTrigger
    )
    console.log('')
    console.log('Servis adları: OrcaApi, OrcaTrigger')
    console.log('Bilgisayar açıldığında otomatik başlarlar.')
    console.log('Kaldırmak için: node scripts/uninstall-windows-services.cjs')
  } catch (err) {
    console.error('Kurulum hatası:', err.message)
    process.exit(1)
  }
}

main()
