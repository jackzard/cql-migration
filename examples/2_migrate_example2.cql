--- up
create type sample_type2 (
    data text
)
---
create table sample2 (
    id text PRIMARY KEY,
    name text
)

--- down
drop type sample_type2;
---
drop table sample2;