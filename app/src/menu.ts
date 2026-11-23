import { MenuContainerProperty, MenuItemProperty } from '@evenrealities/even_hub_sdk'

export const MENU = {
  MOVED: 1,
  POSITIONS: 2,
  PAIR: 3,
  PAUSE: 4,
} as const

export function buildMenu(alertsPaused: boolean): MenuContainerProperty {
  return new MenuContainerProperty({
    menuItems: [
      new MenuItemProperty({ itemName: 'What moved', itemID: MENU.MOVED }),
      new MenuItemProperty({ itemName: 'Positions', itemID: MENU.POSITIONS }),
      new MenuItemProperty({ itemName: 'Pair Telegram', itemID: MENU.PAIR }),
      new MenuItemProperty({
        itemName: alertsPaused ? 'Resume alerts' : 'Pause alerts',
        itemID: MENU.PAUSE,
      }),
    ],
  })
}
