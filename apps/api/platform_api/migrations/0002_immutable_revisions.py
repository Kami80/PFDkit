from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("platform_api", "0001_initial")]
    operations = [
        migrations.RunSQL(
            """CREATE FUNCTION pfdkit_immutable_revision() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'Revisions are immutable; create a new revision'; END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER pfdkit_revision_immutable BEFORE UPDATE ON platform_api_revision
        FOR EACH ROW EXECUTE FUNCTION pfdkit_immutable_revision();""",
            "DROP TRIGGER pfdkit_revision_immutable ON platform_api_revision; DROP FUNCTION pfdkit_immutable_revision();",
        )
    ]
