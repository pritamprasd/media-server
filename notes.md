```sql
DROP TABLE public.file_metadata CASCADE;
DROP TABLE public.import_sessions CASCADE;
DROP TABLE public.imported_directories CASCADE;
DROP TABLE public.imported_files CASCADE;
```

```sh
rsync -avP /media/pritam/Memories/backup_memories/ pritam@homeserver.local:/home/pritam/media_server_files/
```


```
export UID=$(id -u)
export GID=$(id -g)
docker compose up --build -d
```


```sh
Locally:
cd backend && python scripts/regenerate_heic_thumbnails.py

Docker:
docker compose exec backend python scripts/regenerate_heic_thumbnails.py
```