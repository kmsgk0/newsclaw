.PHONY: check check-security test backup

check:
	npm run check -- --base main
	npm run lint
	npm run typecheck
	npm test
	npm run test:api
	npm run build

check-security:
	npm run check:security

test:
	npm test
	npm run test:api

backup:
	docker compose exec -T backup sh /scripts/backup.sh
