.PHONY: check check-security test acceptance backup

check:
	node scripts/checks/check.mjs --group all

check-security:
	npm run check:security

test:
	node scripts/checks/check.mjs --stage unit,api

acceptance:
	sh scripts/acceptance.sh

backup:
	docker compose exec -T backup sh /scripts/backup.sh
