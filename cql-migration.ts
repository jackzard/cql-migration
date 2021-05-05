import path from 'path'
import cassandra from 'cassandra-driver'
import dedent from 'dedent'
import fs from 'fs'

const [, , ...commands] = process.argv
const {
    dir,
    keyspace,
    dataCenter = 'datacenter1',
    url,
    username,
    password,
    extraOptions = {}
} = require(path.join(process.cwd(), '.migration.js'))


const bootstrap = async () => {
    if (!commands.length) {
        return console.warn(`No command found [up/down] [count]`)
    }

    const [command, maxCountStr = '0'] = commands
    const maxCount = parseInt(maxCountStr)
    const client = new cassandra.Client({
        keyspace,
        localDataCenter: dataCenter,
        contactPoints: [url],
        credentials: {
            username, password
        },
        ...extraOptions
    })
    await client.connect()

    await client.execute(dedent`
        create table if not exists dp_migration (
            version text,
            name text,
            created_at timestamp,
            PRIMARY key (version, created_at)
        ) with clustering order by (created_at DESC);
    `, [])

    const migrations = fs.readdirSync(dir)
        .filter(e => (e.endsWith('cql') || e.endsWith('sql')) && e.split('_').length > 1)
        .map(e => {
            const [version, ...names] = e.split('_')
            const name = names.join('_').split('.')[0]
            const file = fs.readFileSync(`${dir}/${e}`, 'utf-8')
            const splitParts = file.split('--- ')
            const upScript = splitParts.find(e => e.startsWith('up')).slice(3)
            const downScript = splitParts.find(e => e.startsWith('down')).slice(5)

            return {downScript, upScript, version, name}
        })

    let lastMigration
    const {rows} = await client.execute(`SELECT * from dp_migration LIMIT 1`)
    if (rows.length) lastMigration = rows[0]
    const lastMigrationIndex = lastMigration
        ? migrations.findIndex(e => e.version === lastMigration.version)
        : -1

    switch (command) {
        case 'up': {
            let count = 0
            for (let i = 0; i < migrations.length; i++) {
                if (count >= maxCount || !migrations[i]) break
                if (i <= lastMigrationIndex) continue
                const {upScript, version, name} = migrations[i]
                try {
                    await client.execute(dedent(upScript))
                } catch (e) {
                    console.error(e)
                    break
                }
                await client.execute(dedent`
                    INSERT INTO dp_migration (version,name,created_at) 
                    VALUES (?,?,?)
                `, [version, name, new Date()])
                console.log(`Migrated ${name}`)
                count++
            }
            process.exit()
            break
        }
        case 'down':
            const targetIndex = lastMigrationIndex - maxCount
            for (let i = lastMigrationIndex; i > targetIndex; i--) {
                if (!migrations[i]) break
                const {downScript, version, name} = migrations[i]
                try {
                    await client.execute(dedent(downScript))
                } catch (e) {
                    console.error(e)
                    break
                }
                await client.execute(`DELETE FROM dp_migration WHERE version = ?`,
                    [version]
                )
                console.log(`Remove Migration ${name}`)
            }
            process.exit()
            break
    }

}

bootstrap()