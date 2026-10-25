package cz.petriczech.tapnote;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

// Dlaždice rychlého nastavení „Nový úkol“: otevře tapnote://new-task stejně jako zkratka v res/xml/shortcuts.xml
public class NewTaskTileService extends TileService {

    // Dlaždice je tlačítko, ne přepínač, proto se drží neaktivní
    @Override
    public void onStartListening() {
        Tile tile = getQsTile();
        tile.setState(Tile.STATE_INACTIVE);
        tile.updateTile();
    }

    @Override
    public void onClick() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("tapnote://new-task"), this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // Od API 34 verze s Intent vyhodí výjimku, předává se PendingIntent
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE));
        } else {
            startActivityAndCollapse(intent);
        }
    }
}
