---
id: cheatsheet
title: Шпаргалка
level: reference
status: draft
---

# Шпаргалка

## Обычный день

| Шаг | Попросить Claude | В GitHub | Команда |
|---|---|---|---|
| 1. Начать задачу | «Создай ветку `fix/card-text` от свежего `main`» | список веток → имя → **Create branch** | `git fetch` · `git switch -c fix/card-text origin/main` |
| 2. Посмотреть, что изменилось | «Покажи, что я поменял» | — | `git status` · `git diff` |
| 3. Сохранить | «Закоммить: „Карточка: текст не обрезается“» | **Edit this file** → **Commit changes…** | `git add <файл>` · `git commit -m "…"` |
| 4. Отправить | «Запушь ветку» | — | `git push -u origin fix/card-text` |
| 5. Открыть PR | «Открой PR в `main` с описанием» | **Compare & pull request** → **Create pull request** | `gh pr create` |
| 6. Проверки | «Что с CI в PR?» | вкладка **Checks** | `gh pr checks` |
| 7. Правки по ревью | «Прочитай комментарии в PR и поправь» | **Files changed** | коммит + `git push` |
| 8. Отстал от `main` | «Подтяни `main` в мою ветку» | **Update branch** | `git fetch` · `git merge origin/main` |
| 9. Слить | — (сливает тот, кому положено) | **Squash and merge** → **Delete branch** | `gh pr merge --squash --delete-branch` |
| 10. Вернуться на `main` | «Переключись на свежий `main`» | — | `git switch main` · `git pull` |

## Перед тем как нажать

| Перед… | Проверь |
|---|---|
| началом работы | ветка от **свежего** `main` |
| коммитом | в коммит идёт только то, что нужно; нет паролей и ключей |
| push | ты в своей ветке, а не в `main` |
| merge | CI зелёный, есть одобрение, ветка не отстаёт, ты знаешь, что merge = выкатка |
| force-push | понимаешь, чьи коммиты перезапишутся. Не понимаешь — не делай |

## Сигналы тревоги в ответе Claude

| Видишь | Значит | Что делать |
|---|---|---|
| `rejected … fetch first` | на GitHub есть коммиты, которых у тебя нет | pull, потом push |
| `CONFLICT` | двое поменяли одно место | смотреть обе версии, решать самому |
| `--force` | перезапись истории | спросить «зачем и что потеряется?» |
| `Your branch is behind` | ты отстал | pull |
| `detached HEAD` | ты стоишь не на ветке, а на отдельном коммите | попросить Claude вернуть на ветку |
| ❌ в PR | проверка упала | **Details** или «разберись, почему CI красный» |
