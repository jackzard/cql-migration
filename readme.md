## Simple Cassandra Migration

### Installation
```
npm i -g cql-migration
```

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
create type sample_type (
    data text
)
---
create table sample (
    id text PRIMARY KEY,
    name text
)

--- down
drop type sample_type;
---
drop table sample;
```


### Commands

`count` is optional
```
cql-migration up [count]
```

---
`count` default 1
```
cql-migration down [count]
```
