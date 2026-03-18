require('dotenv').config()
const sql = require('mssql')
const { getPool } = require('../../dist/scripts/db/connection-pool')

async function main() {
  const pool = await getPool().getPool()

  // 1) InboundAsn.IsCollected = 1 yap (InboundAsnId = 17)
  const r1 = await pool.request()
    .input('InboundAsnId', sql.Int, 17)
    .query('UPDATE dbo.InboundAsn SET IsCollected = 1 WHERE InboundAsnId = @InboundAsnId AND IsCollected = 0')
  console.log('InboundAsn.IsCollected güncellendi:', r1.rowsAffected[0])

  // 2) Exception=1 ve AllocatedDate IS NULL olan request'leri bul
  const r2 = await pool.request()
    .input('InboundAsnId', sql.Int, 17)
    .query(`
      SELECT r.RequestId, r.ReferenceId, r.Exception, r.AllocatedDate,
             ref.CompletedDate AS RefCompletedDate
      FROM dbo.Request r
      LEFT JOIN dbo.Request ref ON ref.RequestId = r.ReferenceId
      WHERE r.InboundAsnId = @InboundAsnId AND r.Exception = 1
      ORDER BY r.RequestId
    `)
  console.log('\nException=1 request durumları:')
  for (const row of r2.recordset) {
    console.log(`  RequestId=${row.RequestId} ReferenceId=${row.ReferenceId} AllocatedDate=${row.AllocatedDate || 'NULL'} RefCompleted=${row.RefCompletedDate || 'NULL'}`)
  }

  // 3) Referansı tamamlanmış olan Exception=1 request'ler için Allocation çalıştır
  const eligible = r2.recordset.filter(r => r.AllocatedDate == null && r.RefCompletedDate != null)
  console.log(`\nAlokasyona hazır Exception=1 request: ${eligible.length}`)

  for (const row of eligible) {
    try {
      const req = pool.request()
      req.input('RequestId', sql.Int, row.RequestId)
      await req.execute('dbo.Allocation')
      console.log(`  Allocation(${row.RequestId}) OK`)
    } catch (err) {
      console.error(`  Allocation(${row.RequestId}) HATA:`, err.message)
    }
  }

  // 4) Kalan (referansı henüz tamamlanmamış) olanları göster
  const remaining = r2.recordset.filter(r => r.AllocatedDate == null && r.RefCompletedDate == null)
  if (remaining.length > 0) {
    console.log(`\nReferansı henüz tamamlanmamış Exception=1 request'ler (${remaining.length}):`)
    for (const row of remaining) {
      console.log(`  RequestId=${row.RequestId} ReferenceId=${row.ReferenceId} → referans henüz bitmedi`)
    }
  }

  // 5) CreateQueueForAllocation çalıştır
  try {
    const req = pool.request()
    req.input('InboundAsnId', sql.Int, 17)
    await req.execute('dbo.CreateQueueForAllocation')
    console.log('\nCreateQueueForAllocation OK')
  } catch (err) {
    console.error('\nCreateQueueForAllocation HATA:', err.message)
  }

  process.exit(0)
}

main().catch(err => { console.error(err.message); process.exit(1) })
