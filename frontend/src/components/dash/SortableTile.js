import React from 'react';
import { Box, Grid, Typography } from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

// One Overview tile that can be dragged to a new spot while the page is in "edit layout" mode.
// Outside edit mode it renders the tile untouched. In edit mode a handle strip appears above the tile (the only
// draggable part, so scrolling on a phone still works) and clicks inside the tile are blocked.
const SortableTile = ({ id, label, grid, editing, children }) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });

  return (
    <Grid
      item
      {...grid}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined }}
    >
      <Box
        sx={{
          height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2, p: editing ? 0.5 : 0,
          border: '1px dashed', borderColor: editing ? 'primary.main' : 'transparent',
          opacity: isDragging ? 0.75 : 1,
        }}
      >
        {editing && (
          <Box
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${label}`}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, mb: 0.5, borderRadius: 1.5,
              cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
              bgcolor: 'action.selected', color: 'text.primary',
            }}
          >
            <DragIndicatorIcon fontSize="small" />
            <Typography variant="caption" fontWeight={700}>{label}</Typography>
          </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0, pointerEvents: editing ? 'none' : 'auto' }}>{children}</Box>
      </Box>
    </Grid>
  );
};

export default SortableTile;
