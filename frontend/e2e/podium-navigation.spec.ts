import { test, expect, type Page } from '@playwright/test'

const portrait = '/uploads/avatars/student.svg'
const students = [
  { userId: 'one', studentName: 'Anne Eleve', avatarUrl: portrait, winCount: 5, lossCount: 0, duelCount: 5, totalCorrectAnswers: 40 },
  { userId: 'two', studentName: 'Bert Eleve', avatarUrl: null, winCount: 3, lossCount: 1, duelCount: 4, totalCorrectAnswers: 25 },
]

test.beforeEach(async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({
    json: route.request().url().includes('/leaderboard/weekly') ? students : [],
  }))
  await page.route(`**${portrait}`, route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="navy"/></svg>',
  }))
})

async function expectPortrait(page: Page) {
  const image = page.getByRole('img', { name: 'Photo de Anne Eleve' })
  await image.scrollIntoViewIfNeeded()
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByRole('img', { name: 'Photo de Bert Eleve' })).toHaveCount(0)
}

test('keeps photos across ranking links, return links and browser history without loading another document', async ({ page }) => {
  const documents: string[] = []
  page.on('request', request => {
    if (request.resourceType() === 'document') documents.push(request.url())
  })

  await page.goto('/')
  await expectPortrait(page)
  // Repeat the round trip to catch errors retained by earlier visits.
  for (let visit = 0; visit < 2; visit++) {
    await page.getByRole('link', { name: 'Voir le classement complet' }).click()
    await expect(page).toHaveURL(/\/classement$/)
    await expectPortrait(page)
    await page.getByRole('link', { name: "Retour a l'accueil" }).click()
    await expect(page).toHaveURL('http://127.0.0.1:4173/')
    await expectPortrait(page)
    await page.goBack()
    await expect(page).toHaveURL(/\/classement$/)
    await expectPortrait(page)
    await page.goForward()
    await expectPortrait(page)
  }
  expect(documents).toEqual(['http://127.0.0.1:4173/'])
})

test('keeps text cards when a photo is unavailable', async ({ page }) => {
  await page.route(`**${portrait}`, route => route.fulfill({ status: 404, body: '' }))
  await page.goto('/classement')
  await page.getByText('1re place', { exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('img', { name: 'Photo de Anne Eleve' })).toHaveCount(0)
  await expect(page.getByText('Anne Eleve', { exact: true }).first()).toBeVisible()
})
