## Simple Cassandra Migration

### Config
create new file name `.migration.js`
```
module.exports = {
    dir: './examples',
    url: '127.0.0.1:9042',
    keyspace: 'dp',
    username: 'cassandra',
    password: 'cassandra',
    dataCenter: 'datacenter1',
    extraOptions: {}
}
```

### File Format
`[version]_[name].[cql/sql]`

example:
`1_create_user_table.cql`

### Example migration cql
```sql
--- up
create table sample (
    id text PRIMARY KEY,
    name text
)

--- down
drop table sample;
```

### Commands

```
cql-migration up [count]
```
`count` is optional


```
cql-migration down [count]
```
`count` default 1