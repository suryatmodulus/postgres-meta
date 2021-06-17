

-- Tables for testing

CREATE TYPE public.user_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TABLE public.users (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text,
  status user_status DEFAULT 'ACTIVE'
);
INSERT INTO 
    public.users (name) 
VALUES 
    ('Joe Bloggs'),
    ('Jane Doe');

CREATE TABLE public.todos (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  details text,
  "user-id" bigint REFERENCES users NOT NULL
);

INSERT INTO 
    public.todos (details, "user-id")
VALUES 
    ('Star the repo', 1),
    ('Watch the releases', 2);


CREATE FUNCTION add(integer, integer) RETURNS integer
    AS 'select $1 + $2;'
    LANGUAGE SQL
    IMMUTABLE
    RETURNS NULL ON NULL INPUT;

create table public.users_audit (
    id BIGINT generated by DEFAULT as identity,
    created_at timestamptz DEFAULT now(),
    user_id bigint,
    previous_value jsonb
);

create function public.audit_action()
returns trigger as $$
begin
    insert into public.users_audit (user_id, previous_value)
    values (old.id, row_to_json(old));

    return new;
end;
$$ language plpgsql;


CREATE TRIGGER check_update
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION public.audit_action();