Run ```npx @better-auth/cli migrate``` to create the db file.

You need to mount the db file in the app configuration in Coolify by adding Directory mount at Persistent Storage.
Leave the source path as is.
Enter /app/data as destination path.
