import {
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { buildMenu } from './menu'
import type { Screen } from './types'

function titleText(id: number, name: string, content: string, capture: 0 | 1): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: capture ? 288 : 48,
    borderWidth: 1,
    borderColor: 8,
    paddingLength: 6,
    containerID: id,
    containerName: name,
    content,
    textColor: 4,
    isEventCapture: capture,
  })
}

function listContainer(items: string[]): ListContainerProperty {
  return new ListContainerProperty({
    xPosition: 0,
    yPosition: 48,
    width: 576,
    height: 240,
    borderWidth: 1,
    borderColor: 8,
    paddingLength: 4,
    containerID: 2,
    containerName: 'rows',
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: 576,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  })
}

export async function showTextScreen(
  bridge: EvenAppBridge,
  screen: Screen,
  content: string,
  alertsPaused: boolean,
): Promise<boolean> {
  return bridge.rebuildPageContainer(
    new RebuildPageContainer({
      containerTotalNum: 1,
      textObject: [titleText(1, screen === 'glance' ? 'glance' : screen, content, 1)],
      menuObject: buildMenu(alertsPaused),
    }),
  )
}

export async function showListScreen(
  bridge: EvenAppBridge,
  title: string,
  items: string[],
  alertsPaused: boolean,
): Promise<boolean> {
  return bridge.rebuildPageContainer(
    new RebuildPageContainer({
      containerTotalNum: 2,
      textObject: [titleText(1, 'title', title, 0)],
      listObject: [listContainer(items.length ? items : ['(empty)'])],
      menuObject: buildMenu(alertsPaused),
    }),
  )
}
