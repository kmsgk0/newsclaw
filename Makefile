.PHONY: check check-security test acceptance backup

check:
	node scripts/checks/check.mjs --group all

check-security:
	npm run check:security
	npm run test:security
	node --import tsx --test --test-concurrency=1 apitest/cases/injection.test.ts apitest/cases/csrf.test.ts apitest/cases/audit.test.ts apitest/cases/skill-audit.test.ts tests/editor/editor-api.test.ts
	npm run build
	npx playwright test tests/e2e/news.spec.ts --project=desktop --grep SEC-10

test:
	node scripts/checks/check.mjs --stage unit,api

acceptance:
	sh scripts/acceptance.sh

backup:
	docker compose exec -T backup sh /scripts/backup.sh
