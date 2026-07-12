# Notes about dev and deployment

### Clean Database
```sql
DROP TABLE IF EXISTS public.file_metadata CASCADE;
DROP TABLE IF EXISTS public.import_sessions CASCADE;
DROP TABLE IF EXISTS public.imported_directories CASCADE;
DROP TABLE IF EXISTS public.imported_files CASCADE;
DROP TABLE IF EXISTS public.detected_faces CASCADE;
DROP TABLE IF EXISTS public.dhash_bands CASCADE;
DROP TABLE IF EXISTS public.favorite_folders CASCADE;
DROP TABLE IF EXISTS public.filter_presets CASCADE;
DROP TABLE IF EXISTS public.persons CASCADE;
DROP TABLE IF EXISTS public.saved_locations CASCADE;
DROP TABLE IF EXISTS public.alembic_version CASCADE;
```
### To copy media to remote host
```sh
rsync -avP /media/pritam/Memories/backup_memories/ pritam@homeserver.local:/home/pritam/media_server_files/
```


### Docker compose UID?GID
```
export UID=$(id -u)
export GID=$(id -g)
docker compose up --build -d
```

### Regenerate thumbnails
```sh
Locally:
cd backend && python scripts/regenerate_heic_thumbnails.py

Docker:
docker compose exec backend python scripts/regenerate_heic_thumbnails.py
```


### Celery flower
```sh
celery -A app.tasks.celery flower
```


### PWA pre-requisits
```
PWA install on Mobile:

chrome://flags -> Insecure origins treated as secure -> Enabled.
https://sever.local:3443 -> Add host
```

