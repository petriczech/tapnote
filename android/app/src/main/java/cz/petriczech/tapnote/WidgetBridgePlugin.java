package cz.petriczech.tapnote;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Most mezi aplikací a widgetem „Můj den“ (src/app/core/native/widget-sync.ts)
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    // Aplikace zrcadlí otevřené úkoly Můj den do widgetu
    @PluginMethod
    public void sync(PluginCall call) {
        MyDayWidgetStore.saveTasks(getContext(), call.getArray("tasks", new JSArray()), call.getString("date", ""));
        call.resolve();
    }

    // Odškrtnutí z widgetu se předají aplikaci a fronta se vyprázdní
    @PluginMethod
    public void takeToggles(PluginCall call) {
        JSObject result = new JSObject();
        result.put("toggles", MyDayWidgetStore.takeToggles(getContext()));
        call.resolve(result);
    }
}
