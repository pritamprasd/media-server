from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.models import CronJob

scheduler = BackgroundScheduler()


def init_scheduler(app):
    """Load all enabled jobs from DB and schedule them with APScheduler."""
    scheduler.start()
    _sync_jobs(app)


def _sync_jobs(app):
    """Reconcile APScheduler jobs with enabled CronJob rows in the database."""
    existing_ids = {job.id for job in scheduler.get_jobs()}

    enabled_jobs = CronJob.query.filter_by(enabled=True).all()
    db_ids = {j.id for j in enabled_jobs}

    for job_id in existing_ids - db_ids:
        scheduler.remove_job(str(job_id))

    for job in enabled_jobs:
        try:
            parts = job.schedule.strip().split()
            if len(parts) == 5:
                trigger = CronTrigger(
                    minute=parts[0],
                    hour=parts[1],
                    day=parts[2],
                    month=parts[3],
                    day_of_week=parts[4],
                )
            else:
                trigger = CronTrigger.from_crontab(job.schedule)

            scheduler.add_job(
                func=_run_scheduled,
                trigger=trigger,
                id=str(job.id),
                args=[app, job.id],
                replace_existing=True,
                name=job.name,
            )
        except Exception as e:
            print(f"Failed to schedule job {job.name}: {e}")


def _run_scheduled(app, job_id):
    """Callback invoked by APScheduler for a scheduled rsync job."""
    with app.app_context():
        from app.routes import trigger_job_run
        trigger_job_run(job_id)


def resync_scheduler(app):
    """Public API to re-sync the scheduler after job add/edit/delete."""
    _sync_jobs(app)
