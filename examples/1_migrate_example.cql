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