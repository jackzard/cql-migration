import path from 'path'
import cassandra from 'cassandra-driver'
import dedent from 'dedent'
import fs from 'fs'

const [, , ...commands] = process.argv
const config = require(path.join(process.cwd(), '.migration.js'))
const {
    dir,
    keyspace,
    url,
    dataCenter = 'datacenter1',
    username,
    password,
    extraOptions = {}
} = config


const bootstrap = async () => {
    if (!commands.length) {
        return console.warn(`No command found [up/down] [count]`)
    }

    const [command, maxCountStr = '0'] = commands
    let maxCount = parseInt(maxCountStr)

    const client = new cassandra.Client({
        keyspace,
        contactPoints: [url],
        credentials: {
            username, password
        },
        localDataCenter: dataCenter,
        socketOptions: {
            connectTimeout: 10_000
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

    const migrations = fs.readdirSync(path.join(process.cwd(), dir))
        .filter(e => (e.endsWith('cql') || e.endsWith('sql')) && e.split('_').length > 1)
        .map(e => {
            const [version, ...names] = e.split('_')
            const name = names.join('_').split('.')[0]
            const file = fs.readFileSync(path.join(`${dir}/${e}`), 'utf-8')
            let splitParts = file.split('---')
            const upIndex = splitParts.findIndex(e => e.startsWith(' up'))
            const downIndex = splitParts.findIndex(e => e.startsWith(' down'))
            splitParts = splitParts.map(e => e.split('\n').slice(1).join('\n'))

            const upScripts = splitParts.filter((e, i) => e && i >= upIndex && i < downIndex)
            const downScripts = splitParts.filter((e, i) => e && i >= downIndex)

            return {upScripts, downScripts, version, name}
        })
        .sort((a, b) => +a.version - +b.version)

    let lastMigration
    const {rows} = await client.execute(`SELECT * from dp_migration`)
    if (rows.length) lastMigration = rows.sort((a, b) => b.version - a.version)[0]
    const lastMigrationIndex = lastMigration
        ? migrations.findIndex(e => e.version === lastMigration.version)
        : -1

    switch (command) {
        case 'up': {
            let count = 0
            if (!maxCount) maxCount = migrations.length

            for (let i = 0; i < migrations.length; i++) {
                if (count >= maxCount || !migrations[i]) break
                if (i <= lastMigrationIndex) continue
                const {upScripts, version, name} = migrations[i]
                try {
                    for (let j = 0; j < upScripts.length; j++) {
                        await client.execute(dedent(upScripts[j]))
                    }
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
            if (!maxCount) maxCount = 1
            const targetIndex = lastMigrationIndex - maxCount
            for (let i = lastMigrationIndex; i > targetIndex; i--) {
                if (!migrations[i]) break
                const {downScripts, version, name} = migrations[i]
                try {
                    for (let j = 0; j < downScripts.length; j++) {
                        await client.execute(dedent(downScripts[j]))
                    }
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