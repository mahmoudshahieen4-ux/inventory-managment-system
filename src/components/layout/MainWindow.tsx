import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { TitleBar } from '@/components/titlebar/TitleBar'
import { LeftSideBar } from './LeftSideBar'
import { RightSideBar } from './RightSideBar'
import { MainWindowContent } from './MainWindowContent'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { PreferencesDialog } from '@/components/preferences/PreferencesDialog'
import { Toaster } from 'sonner'
import { useTheme } from '@/hooks/use-theme'
import { useUIStore } from '@/store/ui-store'
import { useMainWindowEventListeners } from '@/hooks/useMainWindowEventListeners'

/**
 * Layout sizing configuration for resizable panels.
 * All values are percentages of total width when both sidebars are visible.
 */
const LAYOUT = {
  leftSidebar: { default: 18, min: 12, max: 30 },
  rightSidebar: { default: 18, min: 12, max: 30 },
  main: { min: 30 },
} as const

export function MainWindow() {
  const { theme } = useTheme()
  const leftSidebarVisible = useUIStore(state => state.leftSidebarVisible)
  const rightSidebarVisible = useUIStore(state => state.rightSidebarVisible)

  // Set up global event listeners (keyboard shortcuts, etc.)
  useMainWindowEventListeners()

  const visibleSidebarCount =
    Number(leftSidebarVisible) + Number(rightSidebarVisible)
  const mainContentDefault =
    100 - visibleSidebarCount * LAYOUT.leftSidebar.default

  return (
    <div className="flex h-screen w-screen min-w-screen flex-col overflow-hidden bg-background">
      <TitleBar />

      <div className="flex min-w-screen flex-1 overflow-hidden">
        <ResizablePanelGroup
          className="h-full min-w-screen w-screen"
          direction="horizontal"
        >
          {leftSidebarVisible && (
            <>
              <ResizablePanel
                defaultSize={LAYOUT.leftSidebar.default}
                minSize={LAYOUT.leftSidebar.min}
                maxSize={LAYOUT.leftSidebar.max}
              >
                <LeftSideBar />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          <ResizablePanel
            defaultSize={mainContentDefault}
            minSize={LAYOUT.main.min}
          >
            <MainWindowContent />
          </ResizablePanel>

          {rightSidebarVisible && (
            <>
              <ResizableHandle />
              <ResizablePanel
                defaultSize={LAYOUT.rightSidebar.default}
                minSize={LAYOUT.rightSidebar.min}
                maxSize={LAYOUT.rightSidebar.max}
              >
                <RightSideBar />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Global UI Components (hidden until triggered) */}
      <CommandPalette />
      <PreferencesDialog />
      <Toaster
        position="bottom-center"
        theme={
          theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system'
        }
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
            description: 'group-[.toast]:text-muted-foreground',
            actionButton:
              'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
            cancelButton:
              'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          },
        }}
      />
    </div>
  )
}
