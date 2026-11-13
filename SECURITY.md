# Security policy

NCDSS handles health data, so security reports are taken seriously.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately to the maintainer, either through the private vulnerability reporting feature of the repository host, or by email to the address of the latest commits on the main branch.

Include what you can of the following:

- The affected part (server API, client, database, packaging)
- Steps to reproduce or a proof of concept
- The impact you expect

You will get an answer as soon as the maintainer can look at it. Please allow time for a fix before you disclose the issue.

## Supported versions

Only the latest version on the main branch receives security fixes.

## Things to know before you deploy

The defaults are made for development. Before any real deployment:

- Change the default `admin` / `admin123` account password.
- Set `NODE_ENV=production` with a strong `JWT_SECRET` value.
- Set `CORS_ORIGINS` to the origins you really use.
- The API is served over plain HTTP on the local network. Put it behind TLS or keep it on a trusted, isolated network.
- The SQLite database is not encrypted. Protect the machine and the file permissions.
- With the Claude API provider enabled, patient data leaves the local network.

## Known gaps

- Most patient routes only check that the caller is logged in. Role restrictions for these routes are applied in the client interface, not on the server. Any authenticated account can call them directly.
- The audit log does not cover exams, profiles, clinical data imports or logout.
