import { ModelSettingsScreen } from "./screens/ModelSettingsScreen";
import { clampSidebarWidth } from "@zotigo/shared/sidebarWidth";
import { useSidebarWidth } from "./platform/preferences";
import { SidebarResizeHandle } from "./components/SidebarResizeHandle";
import { t } from "@zotigo/shared/i18n/index";
import { useLocale, initializeLanguage } from "./platform/i18n";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SquarePen from "lucide-react-native/icons/square-pen";
import MessageSquare from "lucide-react-native/icons/message-square";
import Settings from "lucide-react-native/icons/settings";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CommonActions,
  DarkTheme,
  NavigationContainer,
  NavigationContext,
  useNavigation,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { DaemonClient } from "./core/client";
import type { Routes } from "./navigation";
import { DaemonContext } from "./platform/context";
import { DeviceSwitchContext, useDeviceSwitchRoot } from "./platform/useDeviceSwitch";
import { IconButton, Action, EmptyState, colors } from "./components/ui";
import { HostPicker } from "./components/HostPicker";
import { HostsScreen } from "./screens/HostsScreen";
import { HomeScreen } from "./features/catalog/HomeScreen";
import { ProjectScreen } from "./features/catalog/ProjectScreen";
import { WorkspaceScreen } from "./features/catalog/WorkspaceScreen";
import { SourcesScreen, SourcePickerScreen } from "./features/catalog/SourcesScreens";
import { FilesScreen } from "./screens/FilesScreen";
import {
  SettingsScreen,
  ModelsScreen,
  ConversationPreferencesScreen,
  TranslationPreferencesScreen,
} from "./screens/SettingsScreen";
import { ChannelsScreen } from "./screens/ChannelsScreen";
import { UsageScreen } from "./features/usage/UsageScreen";
import { NewSessionScreen } from "./screens/NewSessionScreen";
import { ConversationScreen } from "./screens/ConversationScreen";
const Stack = createNativeStackNavigator<Routes>();
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};
function TabletSidebar({
  client,
  connect,
}: {
  client: DaemonClient | null;
  connect: (client: DaemonClient) => void;
}) {
  useLocale();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<Routes>>();
  // Sidebar destinations replace the detail stack so existing unsaved-edit
  // guards run before leaving, instead of hiding an editor under another route.
  const sidebarNavigation = useMemo(
    () => ({
      ...navigation,
      navigate: ((name: keyof Routes, params?: Routes[keyof Routes]) => {
        const state = navigation.getState();
        const current = state.routes[state.index];
        if (
          name === "Conversation" &&
          current.name === name &&
          (current.params as Routes["Conversation"]).id ===
            (params as Routes["Conversation"]).id
        )
          return;
        navigation.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { key: state.routes[0].key, name: "Home" },
              { name, params },
            ],
          }),
        );
      }) as typeof navigation.navigate,
    }),
    [navigation],
  );
  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: colors.background,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      <NavigationContext.Provider value={sidebarNavigation}>
        <SidebarContent client={client} connect={connect} />
      </NavigationContext.Provider>
    </View>
  );
}
function SidebarContent({
  client,
  connect,
}: {
  client: DaemonClient | null;
  connect: (client: DaemonClient) => void;
}) {
  useLocale();
  const navigation = useNavigation<NativeStackNavigationProp<Routes>>();
  const state = navigation.getState();
  // Switching devices remounts navigation, so detail screens must leave first
  // (their unsaved-edit guards run on the way back to Home).
  const atHome = state.routes.length === 1 && state.routes[0].name === "Home";
  const picker = (
    <HostPicker
      client={client}
      onConnect={connect}
      onAdd={() => navigation.navigate("Devices", { add: true })}
      onManage={() => navigation.navigate("Devices")}
      beforeOpen={atHome ? undefined : () => navigation.popTo("Home")}
    />
  );
  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
          minHeight: 52,
        }}
      >
        <IconButton
          icon={Settings}
          label={t("hostShell.settings")}
          onPress={() => navigation.navigate("Settings")}
        />
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 17,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {t("app.zotigo")}</Text>
        <IconButton
          icon={SquarePen}
          label={t("mobileUi.newConversation")}
          disabled={!client}
          onPress={() => navigation.navigate("NewSession", {})}
        />
      </View>
      {client ? <HomeScreen hostPicker={picker} /> : picker}
    </>
  );
}
export default function App() {
  useEffect(() => { void initializeLanguage().catch(() => {}); }, []);
  useLocale();
  const { width } = useWindowDimensions();
  // Hysteresis: free resizing in Stage Manager or Split View near the
  // threshold must not flip the sidebar (and remount it) on every step.
  const wideRef = useRef(width >= 768);
  if (wideRef.current ? width < 720 : width >= 768) wideRef.current = !wideRef.current;
  const wide = wideRef.current;
  const [client, setClient] = useState<DaemonClient | null>(null);
  const deviceSwitch = useDeviceSwitchRoot();
  const sidebar = useSidebarWidth();
  const [dragWidth, setDragWidth] = useState<number>();
  useEffect(() => setDragWidth(undefined), [sidebar.width]);
  const sidebarWidth = clampSidebarWidth(dragWidth ?? sidebar.width, width);
  useEffect(() => () => client?.dispose(), [client]);
  const connect = (next: DaemonClient) => {
    client?.dispose();
    setClient(next);
  };
  // AsyncStorage must settle before mounting navigation, so the first frame
  // already has its saved sidebar width. Saving later never hides the frame.
  if (!sidebar.loaded) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <DeviceSwitchContext.Provider value={deviceSwitch}>
      <DaemonContext.Provider value={client}>
        <NavigationContainer
          key={client?.connection.id ?? "no-device"}
          theme={theme}
        >
          <Stack.Navigator
            layout={({ children, state, descriptors }) => (
              <View style={{ flex: 1, flexDirection: "row" }}>
                <View
                  key="sidebar"
                  style={{
                    width: wide ? sidebarWidth : 0,
                    zIndex: 1,
                    display: wide ? "flex" : "none",
                  }}
                >
                  {wide && (
                    <NavigationContext.Provider
                      value={
                        descriptors[state.routes[state.index].key].navigation
                      }
                    >
                      <TabletSidebar client={client} connect={connect} />
                    </NavigationContext.Provider>
                  )}
                  {wide && <SidebarResizeHandle
                    width={sidebarWidth} frameWidth={width} onWidth={setDragWidth}
                    onCommit={value => { void sidebar.setWidth(value); }} />}
                </View>
                <View key="detail" style={{ flex: 1, minWidth: 0 }}>
                  {children}
                </View>
              </View>
            )}
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.background },
              headerBackButtonDisplayMode: "minimal",
              headerShadowVisible: false,
              headerTitleStyle: { fontSize: 17, fontWeight: "600" },
            }}
          >
            <Stack.Screen
              name="Home"
              options={({ navigation }) => ({
                title: wide ? "" : t("app.zotigo"),
                headerShown: !wide,
                headerLeft: () => (
                  <IconButton
                    icon={Settings}
                    label={t("hostShell.settings")}
                    onPress={() => navigation.navigate("Settings")}
                  />
                ),
                headerRight: () => (
                  <IconButton
                    icon={SquarePen}
                    label={t("mobileUi.newConversation")}
                    disabled={!client}
                    onPress={() => navigation.navigate("NewSession", {})}
                  />
                ),
              })}
            >
              {({ navigation }) => {
                if (wide)
                  return (
                    <View style={{ flex: 1, justifyContent: "center" }}>
                      <EmptyState
                        icon={MessageSquare}
                        title={t("mobile.yourConversations")}
                        message={t("mobile.selectAConversationFromTheSidebarOrStartANewOne")}
                        action={client ? (
                          <Action
                            primary
                            icon={SquarePen}
                            label={t("mobileUi.newConversation")}
                            onPress={() => navigation.navigate("NewSession", {})}
                          />
                        ) : undefined}
                      />
                    </View>
                  );
                const picker = (
                  <HostPicker
                    client={client}
                    onConnect={connect}
                    onAdd={() => navigation.navigate("Devices", { add: true })}
                    onManage={() => navigation.navigate("Devices")}
                  />
                );
                return client ? (
                  <HomeScreen hostPicker={picker} />
                ) : (
                  <View style={{ flex: 1, backgroundColor: colors.background }}>{picker}</View>
                );
              }}
            </Stack.Screen>
            <Stack.Screen
              name="Project"
              component={ProjectScreen}
              options={({ route }) => ({ title: route.params.title })}
            />
            <Stack.Screen
              name="Workspace"
              component={WorkspaceScreen}
              options={({ route }) => ({ title: route.params.title })}
            />
            <Stack.Screen
              name="Sources"
              component={SourcesScreen}
              options={{ title: t("mobile.projectSources") }}
            />
            <Stack.Screen
              name="SourcePicker"
              component={SourcePickerScreen}
              options={{ title: t("app.addSource2") }}
            />
            <Stack.Screen
              name="Conversation"
              getId={({ params }) => params.id}
              component={ConversationScreen}
              // Reserve the action slots up front so long titles truncate
              // instead of sliding under buttons the screen adds after mount.
              options={({ route }) => ({
                title: route.params.title,
                headerRight: () => <View style={{ width: 88 }} />,
                // Web preview header only: UIKit sizes a native title between
                // the bar items itself and does not read this option.
                headerTitleContainerStyle: { maxWidth: Math.max(120, (wide ? width - sidebarWidth : width) - 160) },
              })}
            />
            <Stack.Screen
              name="NewSession"
              component={NewSessionScreen}
              options={{ title: t("mobileUi.newConversation") }}
            />
            <Stack.Screen
              name="Files"
              component={FilesScreen}
              options={{ title: t("mobile.files") }}
            />
            <Stack.Screen name="Settings" options={{ title: t("hostShell.settings") }}>
              {() => <SettingsScreen connected={!!client} />}
            </Stack.Screen>
            <Stack.Screen
              name="Models"
              component={ModelsScreen}
              options={{ title: t("favoriteModelSettings.favoriteModels") }}
            />
            <Stack.Screen
              name="ConversationPreferences"
              options={{ title: t("app.conversation") }}
            >
              {() => <ConversationPreferencesScreen connected={!!client} />}
            </Stack.Screen>
            <Stack.Screen
              name="TranslationPreferences"
              component={TranslationPreferencesScreen}
              options={{ title: t("mobile.translation") }}
            />
            <Stack.Screen
              name="RuntimeSettings"
              component={ModelsScreen}
              options={{ title: t("mobileUi.runtimeStatus") }}
            />
            <Stack.Screen
              name="ModelCatalog"
              component={ModelsScreen}
              options={{ title: t("favoriteModelSettings.codexModels") }}
            />
            <Stack.Screen
              name="Profiles"
              component={ModelSettingsScreen}
              options={{ title: t("mobileUi.modelProfiles") }}
            />
            <Stack.Screen name="Devices" options={{ title: t("mobile.devices") }}>
              {({ route, navigation }) => (
                <HostsScreen
                  onConnect={connect}
                  currentId={client?.connection.id}
                  addOnly={route.params?.add}
                  onClose={() => navigation.goBack()}
                  onRemoved={(id) => {
                    if (id === client?.connection.id) {
                      client.dispose();
                      setClient(null);
                    }
                  }}
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="Channels"
              component={ChannelsScreen}
              options={{ title: t("app.channels") }}
            />
            <Stack.Screen
              name="Usage"
              component={UsageScreen}
              options={{ title: t("usage.title") }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </DaemonContext.Provider>
      </DeviceSwitchContext.Provider>
    </SafeAreaProvider>
  );
}
