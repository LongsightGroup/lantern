# D1 Migrations

Cloudflare CLI-managed D1 migrations belong here.

This is Lantern's only checked-in D1 migration path. The numbered files are
the current product baseline, not a compatibility history:

1. reviewed packages and browser previews
2. administrator authentication
3. the Python autograder lab
4. the governed LMS primitive kernel
5. the tenant namespace required by the LTI protocol-cache adapter

There is no production data to migrate. Rewrite this baseline when the domain
changes instead of preserving obsolete tables or adding compatibility shims.
